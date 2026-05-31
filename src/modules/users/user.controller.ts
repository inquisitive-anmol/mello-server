import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { User } from './user.model';

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = getAuth(request);
  const user = await User.findOne({ clerkId: userId });
  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = getAuth(request);
  const updates = request.body as any;

  const user = await User.findOneAndUpdate(
    { clerkId: userId },
    { $set: updates },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function getUserProfile(request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) {
  const { username } = request.params;
  const user = await User.findOne({ username });
  if (!user) return reply.status(404).send({ error: 'User not found' });
  
  return reply.send(user);
}

export async function updateAvailability(request: FastifyRequest<{ Body: { isAvailable: boolean } }>, reply: FastifyReply) {
  const { userId } = getAuth(request);
  const { isAvailable } = request.body;

  const user = await User.findOneAndUpdate(
    { clerkId: userId },
    { $set: { 'settings.isAvailable': isAvailable } },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}
