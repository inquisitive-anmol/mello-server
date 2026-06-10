import { redis } from '../../config/redis';
import { User } from '../users/user.model';
import { AppConfig } from './config.model';
import { Room } from '../rooms/room.model';
import { Conversation } from '../chat/chat.model';

const DISCOVERY_CACHE_KEY = 'discovery:listeners';
const DISCOVERY_CACHE_TTL = 60; // 60 seconds

export class DiscoveryService {
  static async getActiveListeners(page: number = 1, limit: number = 20, currentUserId?: string) {
    let listeners: any[] = [];
    const cached = await redis.get(DISCOVERY_CACHE_KEY);
    
    if (cached) {
      listeners = JSON.parse(cached);
    } else {
      listeners = await User.find({
        'settings.isListener': true,
        'settings.isAvailable': true,
        status: 'active'
      })
      .sort({ 'metrics.rating': -1 }) // Sort by highest rating
      .limit(100) // Cache top 100 for discovery
      .lean();

      await redis.setex(DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_TTL, JSON.stringify(listeners));
    }

    if (currentUserId) {
      listeners = listeners.filter((u: any) => u._id.toString() !== currentUserId && u.clerkId !== currentUserId);
    }

    const activeRooms = await Room.find({ status: 'active' }).select('participants.userId').lean();
    const busyUserIds = new Set<string>();
    activeRooms.forEach(room => {
      room.participants.forEach(p => busyUserIds.add(p.userId.toString()));
    });

    listeners = listeners.map(u => ({
      ...u,
      isBusy: busyUserIds.has(u._id.toString())
    }));

    const skip = (page - 1) * limit;
    return {
      data: listeners.slice(skip, skip + limit),
      total: listeners.length,
      source: cached ? 'cache' : 'db'
    };
  }

  static async getVibes() {
    const config = await AppConfig.findOne({ key: 'MOODS' }).lean();
    return config ? config.data : [];
  }

  static async getVibeCards() {
    const config = await AppConfig.findOne({ key: 'VIBE_CARDS' }).lean();
    return config ? config.data : [];
  }

  static async getVibeGridQuestions() {
    const config = await AppConfig.findOne({ key: 'VIBE_GRID_QUESTIONS' }).lean();
    return config ? config.data : [];
  }

  static async getPackages() {
    const config = await AppConfig.findOne({ key: 'PACKAGES' }).lean();
    return config ? config.data : [];
  }

  static async getHistory(clerkId: string) {
    const user = await User.findById(clerkId);
    if (!user) return [];

    // Fetch conversations
    const conversations = await Conversation.find({ participants: user._id })
      .populate('participants', 'clerkId profile.displayName profile.avatarUrl profile.vibeTags profile.location settings.isAvailable settings.callRate')
      .lean();

    // Fetch rooms
    const rooms = await Room.find({ 'participants.userId': user._id })
      .populate('participants.userId', 'clerkId profile.displayName profile.avatarUrl profile.vibeTags profile.location settings.isAvailable settings.callRate')
      .lean();

    const historyItems: any[] = [];

    // Process conversations
    for (const conv of conversations) {
      if (!conv.lastMessage) continue; // Skip empty conversations
      
      const partner: any = conv.participants.find((p: any) => p._id.toString() !== user._id.toString());
      if (!partner) continue;

      const dateStr = conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString() : 'Recently';

      historyItems.push({
        id: partner.phoneNumber || partner._id.toString(),
        type: 'message',
        name: partner.profile?.displayName || 'Unknown',
        message: conv.lastMessage,
        date: dateStr,
        timestamp: conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : 0,
        image: partner.profile?.avatarUrl || '',
        isOnline: partner.settings?.isAvailable || false,
        actionText: 'Reply',
        languages: partner.profile?.languages || [],
        location: partner.profile?.location?.city || 'Unknown',
        rateCoins: partner.settings?.callRate || 0,
        videoAvailable: partner.settings?.videoEnabled || false
      });
    }

    // Process rooms
    for (const room of rooms) {
      const partnerParticipant: any = room.participants.find((p: any) => p.userId._id.toString() !== user._id.toString());
      if (!partnerParticipant) continue;
      
      const partner = partnerParticipant.userId;

      const dateStr = room.startedAt ? new Date(room.startedAt).toLocaleDateString() : 'Recently';
      const durationStr = room.totalDuration > 0 ? `${Math.floor(room.totalDuration / 60)} mins` : 'Missed';
      const isMissed = room.totalDuration === 0;

      historyItems.push({
        id: partner.phoneNumber || partner._id.toString(),
        type: 'call',
        name: partner.profile?.displayName || 'Unknown',
        duration: durationStr,
        date: dateStr,
        timestamp: room.startedAt ? new Date(room.startedAt).getTime() : 0,
        image: partner.profile?.avatarUrl || '',
        isOnline: partner.settings?.isAvailable || false,
        isMissed,
        actionText: isMissed ? 'Call Back' : 'Call Again',
        languages: partner.profile?.languages || [],
        location: partner.profile?.location?.city || 'Unknown',
        rateCoins: partner.settings?.callRate || 0,
        videoAvailable: partner.settings?.videoEnabled || false
      });
    }

    // Sort descending by timestamp
    historyItems.sort((a, b) => b.timestamp - a.timestamp);

    return historyItems;
  }

  static async getTransactions() {
    const config = await AppConfig.findOne({ key: 'TRANSACTIONS' }).lean();
    return config ? config.data : [];
  }

  static async toggleLike(listenerId: string, myUserId: string) {
    const user = await User.findOne({ clerkId: listenerId });
    if (!user) throw new Error('Listener not found');

    const index = user.likedBy.indexOf(myUserId);
    if (index === -1) {
      user.likedBy.push(myUserId);
    } else {
      user.likedBy.splice(index, 1);
    }

    await user.save();
    await redis.del(DISCOVERY_CACHE_KEY);

    return { likedBy: user.likedBy };
  }
}
