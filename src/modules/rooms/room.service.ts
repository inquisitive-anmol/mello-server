import { AccessToken } from 'livekit-server-sdk';
import { env } from '../../config/env';
import { Room } from './room.model';
import { Types } from 'mongoose';
import crypto from 'crypto';

export class RoomService {
  static async generateRtcToken(channelId: string, userId: string): Promise<string> {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '1h', // Token valid for 1 hour
    });
    
    at.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: true,
      canSubscribe: true,
    });
    
    return await at.toJwt();
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

    return {
      room,
      channelId,
      callerToken: await this.generateRtcToken(channelId, callerId),
      listenerToken: await this.generateRtcToken(channelId, listenerId)
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

    return {
      room,
      channelId,
      callerToken: await this.generateRtcToken(channelId, callerId),
      listenerToken: await this.generateRtcToken(channelId, listenerId)
    };
  }
}
