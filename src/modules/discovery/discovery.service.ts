import { redis } from '../../config/redis';
import { User } from '../users/user.model';

const DISCOVERY_CACHE_KEY = 'discovery:listeners';
const DISCOVERY_CACHE_TTL = 60; // 60 seconds

export class DiscoveryService {
  static async getActiveListeners(page: number = 1, limit: number = 20) {
    // Try cache first
    const cached = await redis.get(DISCOVERY_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Simple pagination on cached array
      const skip = (page - 1) * limit;
      return {
        data: parsed.slice(skip, skip + limit),
        total: parsed.length,
        source: 'cache'
      };
    }

    // Cache miss, fetch from DB
    const listeners = await User.find({
      'settings.isListener': true,
      'settings.isAvailable': true,
      status: 'active'
    })
    .sort({ 'metrics.rating': -1 }) // Sort by highest rating
    .limit(100) // Cache top 100 for discovery
    .lean();

    // Store in cache
    await redis.setex(DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_TTL, JSON.stringify(listeners));

    const skip = (page - 1) * limit;
    return {
      data: listeners.slice(skip, skip + limit),
      total: listeners.length,
      source: 'db'
    };
  }

  static getVibes() {
    // Static list of vibes for MVP
    return [
      { id: 'tech', label: 'Tech & Startups' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'music', label: 'Music & Indie' },
      { id: 'late-night', label: 'Late Night Chats' },
      { id: 'advice', label: 'Life Advice' },
      { id: 'movies', label: 'Movies & TV' },
    ];
  }
}
