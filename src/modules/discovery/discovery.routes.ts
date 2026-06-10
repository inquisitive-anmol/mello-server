import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getListeners, getVibes, getVibeCards, getVibeGridQuestions, getPackages, getHistory, getTransactions, toggleLike } from './discovery.controller';

export async function discoveryRoutes(app: FastifyInstance) {
  app.get('/vibes', getVibes); // Public endpoint
  app.get('/vibe-cards', getVibeCards);
  app.get('/vibe-grid-questions', getVibeGridQuestions);
  app.get('/packages', getPackages);
  app.get('/history', { preHandler: [requireAuth] }, getHistory);
  app.get('/transactions', { preHandler: [requireAuth] }, getTransactions);

  // Temporarily public for dev
  app.get('/listeners', getListeners);
  app.post<{ Params: { id: string } }>('/listeners/:id/like', { preHandler: [requireAuth] }, toggleLike);
}
