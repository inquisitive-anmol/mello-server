import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { MatchService } from './match.service';
import { User } from '../users/user.model';
import { SystemSettings } from '../admin/system-settings.model';

async function joinMatch(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const user = await User.findById(clerkId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const { vibeTags = [] } = user.profile as any || {};
  const settings = await SystemSettings.findOne();
  const callRate = settings?.audioCallRatePerMinute || 15;
  
  const result = await MatchService.joinQueue(user._id.toString(), vibeTags, callRate);
  return reply.status(202).send(result);
}

async function leaveMatch(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const user = await User.findById(clerkId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const result = await MatchService.leaveQueue(user._id.toString());
  return reply.send(result);
}

export async function matchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);
  app.post('/join', joinMatch);
  app.delete('/leave', leaveMatch);
}
