import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { BILLING_QUEUE_NAME } from './queue';
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
    // We can't easily remove repeatable jobs from inside the job itself without the repeatJobKey
    // Usually the service ending the room removes the repeatable job.
    return;
  }

  const callerParticipant = room.participants.find(p => p.role === 'caller');
  const listenerParticipant = room.participants.find(p => p.role === 'listener');

  if (!callerParticipant || !listenerParticipant) return;

  const callerId = callerParticipant.userId.toString();
  const amount = room.billingRate;

  try {
    const result = await WalletService.debit(callerId, amount, 'call_charge', roomId);
    
    // Broadcast the new balance to the caller
    const io = getIO();
    io.to(callerId).emit(SOCKET_EVENTS.COIN_BALANCE_UPDATE, { newBalance: result.newBalance });
    
    logger.info({ roomId, callerId, amount }, 'Successfully billed for active minute');
  } catch (error: any) {
    logger.warn({ roomId, callerId, err: error.message }, 'Billing failed, ending room');
    
    // Insufficient funds or error, end the call
    room.status = 'ended';
    room.endedAt = new Date();
    room.totalDuration = Math.floor((room.endedAt.getTime() - room.startedAt.getTime()) / 1000);
    await room.save();

    const io = getIO();
    io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, { 
      roomId, 
      duration: room.totalDuration, 
      reason: 'insufficient_funds' 
    });
  }
}, { connection: redis });

billingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Billing job failed');
});
