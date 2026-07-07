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
  // B-5: Rate limit to prevent call spam (max 5 calls per minute per user)
  app.post('/call/initiate', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    } as any
  }, initiateCall);
  app.post('/call/:roomId/accept', acceptCall);
  app.post('/call/:roomId/reject', rejectCall);
}
