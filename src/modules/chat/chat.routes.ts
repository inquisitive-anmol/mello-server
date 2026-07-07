import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { initConversation, getMessages } from './chat.controller';

export async function chatRoutes(app: FastifyInstance) {
  // A-1: All chat endpoints require a valid JWT
  app.addHook('preHandler', requireAuth as any);

  app.post('/conversation', initConversation);
  app.get('/:conversationId/messages', getMessages);
}
