import { redis } from '../../config/redis';
import { matchmakingQueue } from '../../jobs/queue';

const MATCH_POOL_KEY = 'matchmaking:pool';

export class MatchService {
  static async joinQueue(userId: string, vibeTags: string[], callRate: number) {
    const timestamp = Date.now();
    const payload = JSON.stringify({ userId, vibeTags, callRate, timestamp });
    
    // Add to sorted set with timestamp as score
    await redis.zadd(MATCH_POOL_KEY, timestamp, payload);
    
    // Enqueue job for the worker to process this user
    await matchmakingQueue.add('findMatch', { userId, timestamp }, { removeOnComplete: true });
    
    return { success: true, message: 'Joined matchmaking queue' };
  }

  static async leaveQueue(userId: string) {
    // A bit inefficient but fine for MVP: scan to remove
    const elements = await redis.zrange(MATCH_POOL_KEY, 0, -1);
    for (const el of elements) {
      const parsed = JSON.parse(el);
      if (parsed.userId === userId) {
        await redis.zrem(MATCH_POOL_KEY, el);
        break;
      }
    }
    return { success: true, message: 'Left matchmaking queue' };
  }
}
