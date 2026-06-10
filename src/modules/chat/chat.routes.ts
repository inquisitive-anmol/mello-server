import { FastifyInstance } from 'fastify';
import { initConversation, getMessages } from './chat.controller';

export async function chatRoutes(app: FastifyInstance) {
  app.post('/conversation', initConversation);
  app.get('/:conversationId/messages', getMessages);
}
