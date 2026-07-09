import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../../config/env';
import { Room } from './room.model';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { billingQueue, callTimeoutQueue } from '../../jobs/queue';
import { getIO } from '../../realtime/socket.server';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { logger } from '../../utils/logger';
// C-6: RoomServiceClient for explicit room lifecycle management
const roomServiceClient = new RoomServiceClient(
  env.LIVEKIT_URL,
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export class RoomService {
  static async generateRtcToken(channelId: string, userId: string): Promise<string> {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '5m', // B-4: Token valid for 5 minutes instead of 1 hour
    });
    
    at.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: true,
      canSubscribe: true,
    });
    
    return await at.toJwt();
  }

  /**
   * C-6: Explicitly create the LiveKit room with lifecycle constraints.
   *  - emptyTimeout: 120s — room is destroyed if nobody joins within 2 minutes
   *    (covers the 30-second call timeout + buffer for network delays)
   *  - maxParticipants: 2 — enforced at the LiveKit layer, prevents gate-crashing
   *  - metadata: links back to our DB room ID for webhook processing
   */
  static async createLiveKitRoom(channelId: string, dbRoomId: string): Promise<void> {
    try {
      await roomServiceClient.createRoom({
        name: channelId,
        emptyTimeout: 120,     // seconds: auto-close if nobody joins within 2 minutes
        maxParticipants: 2,    // caller + listener only
        metadata: JSON.stringify({ dbRoomId }),
      });
    } catch (err: any) {
      // If the room already exists (duplicate create), that's fine
      if (!err?.message?.includes('already exists')) {
        throw err;
      }
    }
  }

  static async createMatchRoom(
    callerId: string, 
    listenerId: string, 
    vibeTag: string, 
    billingRate: number
  ) {
    const channelId = crypto.randomUUID();

    const room = await Room.create({
      channelId,
      vibeTag,
      billingRate,
      participants: [
        { userId: new Types.ObjectId(callerId), role: 'caller' },
        { userId: new Types.ObjectId(listenerId), role: 'listener' }
      ]
    });

    // C-6: Create the LiveKit room explicitly before minting tokens
    await this.createLiveKitRoom(channelId, room._id.toString());

    return {
      room,
      channelId,
      callerToken: await this.generateRtcToken(channelId, callerId)
    };
  }

  static async createDirectRoom(
    callerId: string, 
    listenerId: string, 
    billingRate: number
  ) {
    const channelId = crypto.randomUUID();

    const room = await Room.create({
      channelId,
      vibeTag: 'Direct',
      billingRate,
      status: 'waiting',
      participants: [
        { userId: new Types.ObjectId(callerId), role: 'caller' },
        { userId: new Types.ObjectId(listenerId), role: 'listener' }
      ]
    });

    // C-6: Create the LiveKit room explicitly before minting tokens
    await this.createLiveKitRoom(channelId, room._id.toString());

    return {
      room,
      channelId,
      callerToken: await this.generateRtcToken(channelId, callerId)
    };
  }

  static async endRoom(roomId: string) {
    const room = await Room.findById(roomId);
    if (!room) return null;

    if (room.status === 'ended') {
      return room;
    }

    const wasActive = room.status === 'active';
    room.status = 'ended';
    room.endedAt = new Date();
    room.totalDuration = wasActive
      ? Math.floor((room.endedAt.getTime() - room.startedAt.getTime()) / 1000)
      : 0;
    
    await room.save();

    if (room.billingRepeatKey) {
      await billingQueue.removeRepeatableByKey(room.billingRepeatKey).catch(() => {});
    }

    await callTimeoutQueue.remove(`call-timeout-${roomId}`).catch(() => {});

    try {
      await roomServiceClient.deleteRoom(room.channelId);
    } catch (e) {
      logger.error({ err: e }, 'Failed to delete room from LiveKit');
    }

    const io = getIO();
    const eventPayload = { 
      roomId, 
      duration: room.totalDuration, 
      reason: 'user_ended' 
    };
    
    io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, eventPayload);
    
    room.participants.forEach(p => {
      io.to(p.userId.toString()).emit(SOCKET_EVENTS.CALL_ENDED, eventPayload);
    });

    return room;
  }
}
