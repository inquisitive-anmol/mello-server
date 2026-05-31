import { Queue } from 'bullmq';
import { redis } from '../config/redis';

// Note: BullMQ requires the redis connection to have maxRetriesPerRequest: null
// We've already set this in src/config/redis.ts

export const MATCHMAKING_QUEUE_NAME = 'matchmaking';
export const BILLING_QUEUE_NAME = 'billing';

export const matchmakingQueue = new Queue(MATCHMAKING_QUEUE_NAME, { connection: redis });
export const billingQueue = new Queue(BILLING_QUEUE_NAME, { connection: redis });
