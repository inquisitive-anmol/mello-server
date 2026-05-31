import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { Room } from './room.model';
import { Review } from './review.model';
import { User } from '../users/user.model';
import { getIO } from '../../realtime/socket.server';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { billingQueue } from '../../jobs/queue';

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
  await billingQueue.removeRepeatable('charge', {
    every: 60000,
    jobId: `billing:${roomId}`
  });

  const io = getIO();
  io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, { 
    roomId, 
    duration: room.totalDuration, 
    reason: 'user_ended' 
  });

  return reply.send({ success: true, duration: room.totalDuration });
}

export async function getCallHistory(
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply
) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
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
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
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
