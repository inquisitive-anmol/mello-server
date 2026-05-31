import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getListeners, getVibes } from './discovery.controller';

export async function discoveryRoutes(app: FastifyInstance) {
  app.get('/vibes', getVibes); // Public endpoint

  // Authenticated endpoints
  app.register(async (authApi) => {
    authApi.addHook('preHandler', requireAuth as any);
    authApi.get('/listeners', getListeners);
  });
}
