import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { MATCHMAKING_QUEUE_NAME } from './queue';
import { logger } from '../utils/logger';

// Very basic worker for MVP that just logs. 
// In a real system, this would scan the Redis pool, find a match using Redlock, and call RoomService.
export const matchmakingWorker = new Worker(MATCHMAKING_QUEUE_NAME, async (job) => {
  logger.info({ jobId: job.id, data: job.data }, 'Processing matchmaking job');
  // TODO: Implement actual matchmaking algorithm (Phase 5 or scale phase)
}, { connection: redis });

matchmakingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Matchmaking job completed');
});

matchmakingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Matchmaking job failed');
});
