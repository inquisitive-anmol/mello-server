import { FastifyInstance } from 'fastify';
import { clerkWebhookHandler } from './auth.controller';

export async function authRoutes(app: FastifyInstance) {
  app.post('/webhook/clerk', clerkWebhookHandler);
}
