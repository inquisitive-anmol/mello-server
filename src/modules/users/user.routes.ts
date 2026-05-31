import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getMe, updateMe, getUserProfile, updateAvailability } from './user.controller';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);

  app.get('/me', getMe);
  app.patch('/me', updateMe);
  app.get('/:username', getUserProfile);
  app.patch('/me/availability', updateAvailability);
}
