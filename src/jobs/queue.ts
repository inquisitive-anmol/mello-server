import { Queue } from 'bullmq';
import { redis } from '../config/redis';

// Note: BullMQ requires the redis connection to have maxRetriesPerRequest: null
// We've already set this in src/config/redis.ts

export const MATCHMAKING_QUEUE_NAME = 'matchmaking';
export const BILLING_QUEUE_NAME = 'billing';
export const PRESENCE_QUEUE_NAME = 'presence';
export const CALL_TIMEOUT_QUEUE_NAME = 'call-timeout';

export const matchmakingQueue = new Queue(MATCHMAKING_QUEUE_NAME, { connection: redis });
export const billingQueue = new Queue(BILLING_QUEUE_NAME, { connection: redis });
export const presenceQueue = new Queue(PRESENCE_QUEUE_NAME, { connection: redis });
// A-7: Persistent delayed queue for 30s call auto-reject (survives server restarts)
export const callTimeoutQueue = new Queue(CALL_TIMEOUT_QUEUE_NAME, { connection: redis });

