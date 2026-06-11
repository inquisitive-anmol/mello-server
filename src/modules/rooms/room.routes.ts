import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getRoom, endRoom, getCallHistory, submitReview, initiateCall, acceptCall, rejectCall } from './room.controller';

export async function roomRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);

  app.get('/history', getCallHistory);
  app.get('/:roomId', getRoom);
  app.post('/:roomId/end', endRoom);
  app.post('/:roomId/review', submitReview);

  // Direct Calling
  app.post('/call/initiate', initiateCall);
  app.post('/call/:roomId/accept', acceptCall);
  app.post('/call/:roomId/reject', rejectCall);
}
