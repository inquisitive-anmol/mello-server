import { FastifyRequest, FastifyReply } from 'fastify';
import { Room } from './room.model';
import { Review } from './review.model';
import { User } from '../users/user.model';
import { getIO } from '../../realtime/socket.server';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { billingQueue, callTimeoutQueue } from '../../jobs/queue';
import { RoomService } from './room.service';
import { WalletService } from '../wallet/wallet.service';
import { sendPushNotification } from '../../services/push.service';
import { SystemSettings } from '../admin/system-settings.model';

export async function getRoom(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
  const { roomId } = request.params;
  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });
  return reply.send(room);
}

export async function endRoom(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const { roomId } = request.params;
  
  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  // A-5: Verify the requester is a participant in this room
  const caller = await User.findById(userId);
  if (!caller) return reply.status(404).send({ error: 'User not found' });

  const isParticipant = room.participants.some(p => p.userId.equals(caller._id));
  if (!isParticipant) {
    return reply.status(403).send({ error: 'You are not a participant in this room' });
  }

  if (room.status === 'ended') {
    return reply.send({ message: 'Room already ended' });
  }

  await RoomService.endRoom(roomId);

  return reply.send({ success: true, message: 'Room ended' });
}

export async function getCallHistory(
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const user = await User.findById(userId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const page = Number(request.query.page) || 1;
  const limit = Number(request.query.limit) || 20;
  const skip = (page - 1) * limit;

  const history = await Room.find({ 'participants.userId': user._id })
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Room.countDocuments({ 'participants.userId': user._id });

  return reply.send({
    data: history,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function submitReview(
  request: FastifyRequest<{ Params: { roomId: string }, Body: { rating: number; tags: string[] } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const user = await User.findById(userId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const { roomId } = request.params;
  const { rating, tags } = request.body;

  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  const isParticipant = room.participants.some(p => p.userId.equals(user._id));
  if (!isParticipant) {
    return reply.status(403).send({ error: 'You were not a participant in this room' });
  }

  const revieweeParticipant = room.participants.find(p => !p.userId.equals(user._id));
  if (!revieweeParticipant) {
    return reply.status(400).send({ error: 'No partner found to review' });
  }

  let review;
  try {
    review = await Review.create({
      roomId: room._id,
      reviewerId: user._id,
      revieweeId: revieweeParticipant.userId,
      rating,
      tags
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return reply.status(409).send({ error: 'You have already reviewed this call' });
    }
    throw err;
  }

  // Increment rating metrics for the user in background
  User.findByIdAndUpdate(revieweeParticipant.userId, {
    $inc: { 'metrics.reviewCount': 1 }
    // A proper moving average calculation should be done, but omitted for brevity in MVP
  }).exec();

  return reply.status(201).send(review);
}

export async function initiateCall(
  request: FastifyRequest<{ Body: { targetUserId: string, type: 'audio' | 'video' } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const caller = await User.findById(userId);
  if (!caller) return reply.status(404).send({ error: 'User not found' });

  const { targetUserId, type } = request.body;
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) return reply.status(404).send({ error: 'Target user not found' });

  // MVP gating: target must be opted-in as an available listener
  if (!targetUser.settings?.isListener || !targetUser.settings?.isAvailable) {
    return reply.status(403).send({ error: 'This user is not available for calls' });
  }

  // B-1: Check if caller blocked target or target blocked caller
  if (caller.blockedUsers?.includes(targetUser._id.toString())) {
    return reply.status(403).send({ error: 'You have blocked this user' });
  }
  if (targetUser.blockedUsers?.includes(caller._id.toString())) {
    return reply.status(403).send({ error: 'You cannot call this user' });
  }

  const settings = await SystemSettings.findOne();
  const audioRate = settings?.audioCallRatePerMinute || 15;
  const videoRate = settings?.videoCallRatePerMinute || 30;
  
  const billingRate = type === 'video' ? videoRate : audioRate;

  const balance = await WalletService.getBalance(caller._id.toString());
  if (balance < billingRate) {
    return reply.status(402).send({ error: 'Insufficient coins to start this call' });
  }

  const result = await RoomService.createDirectRoom(caller._id.toString(), targetUser._id.toString(), billingRate);
  const roomId = result.room._id.toString();
  const callPayload = {
    roomId,
    callerId: caller._id.toString(),
    callerName: caller.profile.displayName || 'Unknown User',
    callerImage: caller.profile.avatarUrl || '',
    type,
    rateCoins: billingRate,
  };

  const io = getIO();
  io.to(targetUser._id.toString()).emit(SOCKET_EVENTS.CALL_INCOMING, callPayload);

  // --- Gap 3: Push notification for background/closed app ---
  if (targetUser.pushToken) {
    await sendPushNotification({
      pushToken: targetUser.pushToken,
      title: `${caller.profile.displayName || 'Someone'} is calling`,
      body: type === 'video' ? 'Incoming video call on Mello' : 'Incoming audio call on Mello',
      data: callPayload,
    });
  }

  // A-7: Use a BullMQ delayed job for the 30-second timeout instead of setTimeout.
  // This survives server restarts — orphaned "waiting" rooms are cleaned up reliably.
  await callTimeoutQueue.add(
    'autoReject',
    { roomId, callerId: caller._id.toString(), calleeId: targetUser._id.toString() },
    {
      delay: 30_000,
      jobId: `call-timeout-${roomId}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  return reply.send({ 
    success: true, 
    roomId, 
    callerToken: result.callerToken 
  });
}


export async function acceptCall(
  request: FastifyRequest<{ Params: { roomId: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const { roomId } = request.params;
  
  // SEC: Verify the requester is the intended callee (listener role)
  const requester = await User.findById(userId);
  if (!requester) return reply.status(404).send({ error: 'User not found' });

  // Atomic state transition: Ensure we only accept if the room is still waiting.
  // This prevents the "Zombie Call" race condition where the caller cancels exactly as the listener accepts.
  const room = await Room.findOneAndUpdate(
    { 
      _id: roomId, 
      status: 'waiting',
      'participants.userId': requester._id,
      'participants.role': 'listener' 
    },
    { 
      $set: { 
        status: 'active',
        startedAt: new Date()
      } 
    },
    { new: true }
  );

  if (!room) {
    // If not found, it either doesn't exist, isn't waiting, or the user isn't the listener.
    return reply.status(400).send({ error: 'Call is no longer available or unauthorized' });
  }

  // Listener token
  const listenerToken = await RoomService.generateRtcToken(room.channelId, userId);

  // Billing is intentionally NOT started here anymore.
  // It will be triggered by LiveKit's participant_joined webhook when both users actually connect.

  // For the caller, emit CALL_CONNECTED now that everything is set up successfully
  const callerParticipant = room.participants.find(p => p.role === 'caller');
  if (callerParticipant) {
    const io = getIO();
    io.to(callerParticipant.userId.toString()).emit(SOCKET_EVENTS.CALL_CONNECTED, {
      roomId: room._id.toString()
    });
  }

  return reply.send({ success: true, listenerToken });
}

export async function rejectCall(
  request: FastifyRequest<{ Params: { roomId: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const { roomId } = request.params;
  const room = await Room.findById(roomId);
  
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  // A-5: Verify the requester is the intended callee (listener role)
  const rejecter = await User.findById(userId);
  if (!rejecter) return reply.status(404).send({ error: 'User not found' });

  const listenerParticipant = room.participants.find(p => p.role === 'listener');
  if (!listenerParticipant || !listenerParticipant.userId.equals(rejecter._id)) {
    return reply.status(403).send({ error: 'Only the call recipient can reject this call' });
  }


  await RoomService.endRoom(roomId);
  return reply.send({ success: true });
}
