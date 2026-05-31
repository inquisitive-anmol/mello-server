import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getRoom, endRoom, getCallHistory, submitReview } from './room.controller';

export async function roomRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);

  app.get('/history', getCallHistory);
  app.get('/:roomId', getRoom);
  app.post('/:roomId/end', endRoom);
  app.post('/:roomId/review', submitReview);
}
