import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { PRESENCE_QUEUE_NAME } from './queue';
import { User } from '../modules/users/user.model';

const worker = new Worker(
  PRESENCE_QUEUE_NAME,
  async (job: Job) => {
    if (job.name === 'markOffline') {
      const { userId } = job.data;
      
      try {
        const user = await User.findByIdAndUpdate(userId, {
          'settings.isAvailable': false
        });
        
        if (user) {
          logger.info({ userId }, 'User marked offline due to inactivity timeout');
          await redis.del('discovery:listeners');
        }
      } catch (err) {
        logger.error({ err, userId }, 'Failed to mark user offline in worker');
      }
    }
  },
  { connection: redis }
);

worker.on('failed', (job, err) => {
  logger.error({ err, jobId: job?.id }, 'Presence worker job failed');
});

export const presenceWorker = worker;
