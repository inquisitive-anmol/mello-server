import { FastifyRequest, FastifyReply } from 'fastify';
import { Room } from './room.model';
import { Review } from './review.model';
import { User } from '../users/user.model';
import { getIO } from '../../realtime/socket.server';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { billingQueue } from '../../jobs/queue';
import { RoomService } from './room.service';
import { WalletService } from '../wallet/wallet.service';

export async function getRoom(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
  const { roomId } = request.params;
  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });
  return reply.send(room);
}

export async function endRoom(request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) {
  const { roomId } = request.params;
  
  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  if (room.status === 'ended') {
    return reply.send({ message: 'Room already ended' });
  }

  room.status = 'ended';
  room.endedAt = new Date();
  room.totalDuration = Math.floor((room.endedAt.getTime() - room.startedAt.getTime()) / 1000);
  await room.save();

  // Remove billing job for this room
  await billingQueue.removeRepeatable('charge', { every: 60000 }, `billing:${roomId}`);

  const io = getIO();
  const eventPayload = { 
    roomId, 
    duration: room.totalDuration, 
    reason: 'user_ended' 
  };
  
  // Emit to the room
  io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, eventPayload);
  
  // Also emit directly to individual participants to guarantee delivery
  room.participants.forEach(p => {
    io.to(p.userId.toString()).emit(SOCKET_EVENTS.CALL_ENDED, eventPayload);
  });

  return reply.send({ success: true, duration: room.totalDuration });
}

export async function getCallHistory(
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply
) {
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const user = await User.findById(clerkId);
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
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const user = await User.findById(clerkId);
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

  const review = await Review.create({
    roomId: room._id,
    reviewerId: user._id,
    revieweeId: revieweeParticipant.userId,
    rating,
    tags
  });

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
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const caller = await User.findById(clerkId);
  if (!caller) return reply.status(404).send({ error: 'User not found' });

  const { targetUserId, type } = request.body;
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) return reply.status(404).send({ error: 'Target user not found' });

  const billingRate = targetUser.settings.callRate || 8;

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
    const { sendPushNotification } = await import('../../services/push.service');
    await sendPushNotification({
      pushToken: targetUser.pushToken,
      title: `${caller.profile.displayName || 'Someone'} is calling`,
      body: type === 'video' ? 'Incoming video call on Mello' : 'Incoming audio call on Mello',
      data: callPayload,
    });
  }

  // --- Gap 1: 30-second call timeout ---
  setTimeout(async () => {
    try {
      const room = await Room.findById(roomId);
      // Only auto-reject if still waiting (no one accepted/rejected yet)
      if (room && room.status === 'waiting') {
        room.status = 'ended';
        room.endedAt = new Date();
        await room.save();

        // Notify listener to dismiss the incoming call UI
        io.to(targetUser._id.toString()).emit(SOCKET_EVENTS.CALL_TIMEOUT, { roomId });
        // Notify caller that call timed out
        io.to(caller._id.toString()).emit(SOCKET_EVENTS.CALL_ENDED, { roomId, reason: 'timeout' });
      }
    } catch (err) {
      console.error('[Call timeout] Error auto-rejecting timed-out call:', err);
    }
  }, 30_000);

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
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const { roomId } = request.params;
  
  const room = await Room.findById(roomId);
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  if (room.status !== 'waiting') {
    return reply.status(400).send({ error: 'Call is no longer waiting' });
  }

  room.status = 'active';
  room.startedAt = new Date();
  await room.save();

  // Need to fetch tokens again or simply respond so the listener joins
  // For the caller, emit CALL_CONNECTED
  const callerParticipant = room.participants.find(p => p.role === 'caller');
  if (callerParticipant) {
    const io = getIO();
    io.to(callerParticipant.userId.toString()).emit(SOCKET_EVENTS.CALL_CONNECTED, {
      roomId: room._id.toString()
    });
  }

  // Listener token
  const listenerToken = await RoomService.generateRtcToken(room.channelId, clerkId);

  // Start billing job
  await billingQueue.add('charge', { roomId: room._id.toString() }, {
    repeat: { 
      every: 60000,
      jobId: `billing:${room._id.toString()}`
    }
  });

  return reply.send({ success: true, listenerToken });
}

export async function rejectCall(
  request: FastifyRequest<{ Params: { roomId: string } }>,
  reply: FastifyReply
) {
  const { roomId } = request.params;
  const room = await Room.findById(roomId);
  
  if (!room) return reply.status(404).send({ error: 'Room not found' });

  room.status = 'ended';
  room.endedAt = new Date();
  await room.save();

  // Safely attempt to remove billing job if it existed
  await billingQueue.removeRepeatable('charge', { every: 60000 }, `billing:${roomId}`);

  const callerParticipant = room.participants.find(p => p.role === 'caller');
  if (callerParticipant) {
    const io = getIO();
    io.to(callerParticipant.userId.toString()).emit(SOCKET_EVENTS.CALL_ENDED, {
      roomId: room._id.toString(),
      reason: 'rejected'
    });
  }

  return reply.send({ success: true });
}
