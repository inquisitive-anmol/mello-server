import { redis } from '../../config/redis';
import crypto from 'crypto';

export class RedisLock {
  private resource: string;
  private ttl: number;
  private val: string;

  constructor(resource: string, ttlMs: number = 5000) {
    this.resource = `lock:${resource}`;
    this.ttl = ttlMs;
    this.val = crypto.randomBytes(16).toString('hex');
  }

  async acquire(retryCount: number = 5, retryDelay: number = 200): Promise<boolean> {
    for (let i = 0; i < retryCount; i++) {
      const result = await redis.set(this.resource, this.val, 'PX', this.ttl, 'NX');
      if (result === 'OK') {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
    return false;
  }

  async release(): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, this.resource, this.val);
  }
}
