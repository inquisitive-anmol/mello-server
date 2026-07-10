import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { CALL_TIMEOUT_QUEUE_NAME } from './queue';
import { Room } from '../modules/rooms/room.model';
import { getIO } from '../realtime/socket.server';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { logger } from '../utils/logger';

/**
 * A-7: Call Timeout Worker
 *
 * Processes delayed 'autoReject' jobs that are enqueued when a call is initiated.
 * Each job fires 30 seconds later. If the room is still in "waiting" status at that
 * point (neither accepted nor rejected), it auto-rejects the call and notifies both parties.
 *
 * Using BullMQ instead of setTimeout ensures this logic survives server restarts —
 * an in-process timer would be lost on any crash/deploy during the 30-second window.
 */
export const callTimeoutWorker = new Worker(
  CALL_TIMEOUT_QUEUE_NAME,
  async (job: Job) => {
    if (job.name !== 'autoReject') return;

    const { roomId, callerId, calleeId } = job.data;

    try {
      const room = await Room.findById(roomId);

      // Only auto-reject if still waiting — if accepted/rejected already, do nothing
      if (!room || room.status !== 'waiting') {
        logger.info({ roomId }, '[CallTimeout] Room already resolved, skipping auto-reject');
        return;
      }

      const { RoomService } = require('../modules/rooms/room.service');
      await RoomService.endRoom(roomId);

      const io = getIO();

      // Tell the callee to dismiss the incoming call UI
      io.to(calleeId).emit(SOCKET_EVENTS.CALL_TIMEOUT, { roomId });

      // Tell the caller the call timed out
      io.to(callerId).emit(SOCKET_EVENTS.CALL_ENDED, { roomId, reason: 'timeout' });

      logger.info({ roomId, callerId, calleeId }, '[CallTimeout] Call auto-rejected after 30s');
    } catch (err) {
      logger.error({ err, roomId }, '[CallTimeout] Error auto-rejecting timed-out call');
      throw err; // rethrow so BullMQ marks the job as failed
    }
  },
  { connection: redis }
);

callTimeoutWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[CallTimeout] Job failed');
});
