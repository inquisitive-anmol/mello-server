import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { MatchService } from './match.service';
import { User } from '../users/user.model';

async function joinMatch(request: FastifyRequest, reply: FastifyReply) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const { vibeTags = [], callRate = 10 } = user.profile as any || {}; // Adjust based on schema typing
  
  const result = await MatchService.joinQueue(user._id.toString(), vibeTags, callRate);
  return reply.status(202).send(result);
}

async function leaveMatch(request: FastifyRequest, reply: FastifyReply) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const result = await MatchService.leaveQueue(user._id.toString());
  return reply.send(result);
}

export async function matchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);
  app.post('/join', joinMatch);
  app.delete('/leave', leaveMatch);
}
