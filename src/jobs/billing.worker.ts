import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { BILLING_QUEUE_NAME, billingQueue } from './queue';
import { Room } from '../modules/rooms/room.model';
import { WalletService } from '../modules/wallet/wallet.service';
import { getIO } from '../realtime/socket.server';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { logger } from '../utils/logger';

export const billingWorker = new Worker(BILLING_QUEUE_NAME, async (job) => {
  const { roomId } = job.data;
  
  if (!roomId) {
    logger.error('Billing job missing roomId');
    return;
  }

  const room = await Room.findById(roomId);
  
  if (!room) {
    logger.warn({ roomId }, 'Room not found during billing cycle');
    return;
  }

  if (room.status !== 'active') {
    logger.info({ roomId }, 'Room is no longer active, terminating billing job');
    if (room.billingRepeatKey) {
      await billingQueue.removeRepeatableByKey(room.billingRepeatKey).catch(() => {});
    }
    return;
  }

  const callerParticipant = room.participants.find(p => p.role === 'caller');
  const listenerParticipant = room.participants.find(p => p.role === 'listener');

  if (!callerParticipant || !listenerParticipant) return;

  const callerId = callerParticipant.userId.toString();
  const listenerId = listenerParticipant.userId.toString();

  const callerPresence = await redis.get(`presence:${callerId}`);
  const listenerPresence = await redis.get(`presence:${listenerId}`);

  if (!callerPresence || !listenerPresence) {
    const graceKey = `grace:${roomId}`;
    const graceCount = await redis.incr(graceKey);
    
    if (graceCount === 1) {
      await redis.expire(graceKey, 120); // 2 minutes expiry
      logger.warn({ roomId, callerId, listenerId }, 'A participant is offline, entering 1-minute grace period');
      return; // Skip billing this minute, but don't kill the room yet
    }
    
    // Grace period expired (2 consecutive missing presence checks)
    logger.warn({ roomId, callerId, listenerId }, 'Grace period expired, ending room');
    await redis.del(graceKey);
    
    const { RoomService } = require('../modules/rooms/room.service');
    await RoomService.endRoom(roomId);
    return;
  }

  // Presence ok, clear any grace period
  await redis.del(`grace:${roomId}`);

  const amount = room.billingRate;

  try {
    const idempotencyKey = job.id || `billing-${roomId}-${Date.now()}`;
    const result = await WalletService.debit(callerId, amount, 'call_charge', idempotencyKey);
    
    // Broadcast the new balance to the caller
    const io = getIO();
    io.to(callerId).emit(SOCKET_EVENTS.COIN_BALANCE_UPDATE, { newBalance: result.newBalance });
    
    // Credit the listener (Commission for the active minute)
    const creditResult = await WalletService.credit(listenerId, amount, 'call_earnings', idempotencyKey);
    io.to(listenerId).emit(SOCKET_EVENTS.COIN_BALANCE_UPDATE, { newBalance: creditResult.newBalance });

    logger.info({ roomId, callerId, listenerId, amount }, 'Successfully billed caller and credited listener for active minute');
  } catch (error: any) {
    logger.warn({ roomId, callerId, err: error.message }, 'Billing failed, ending room');
    
    // Insufficient funds or error, end the call
    const { RoomService } = require('../modules/rooms/room.service');
    await RoomService.endRoom(roomId);
  }
}, { connection: redis });

billingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Billing job failed');
});
