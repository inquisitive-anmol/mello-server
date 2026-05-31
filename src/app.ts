import fastify from 'fastify';
import cors from '@fastify/cors';
import { clerkPlugin } from '@clerk/fastify';
import { setupErrorHandler } from './middleware/error.middleware';
import { env } from './config/env';

import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/user.routes';
import { walletRoutes } from './modules/wallet/wallet.routes';

import { discoveryRoutes } from './modules/discovery/discovery.routes';

import { matchRoutes } from './modules/match/match.routes';

import { roomRoutes } from './modules/rooms/room.routes';

export function buildApp() {
  const app = fastify({
    logger: false, // We're using a custom pino logger
  });

  // Attach rawBody for Svix webhooks
  app.addHook('preParsing', (request, reply, payload, done) => {
    let rawBody = '';
    payload.on('data', chunk => {
      rawBody += chunk.toString();
    });
    payload.on('end', () => {
      (request as any).rawBody = rawBody;
    });
    done(null, payload);
  });

  // Plugins
  app.register(cors, {
    origin: '*',
  });

  app.register(require('@fastify/rate-limit'), {
    max: 100, // 100 requests
    timeWindow: '1 minute'
  });

  // Health checks — registered BEFORE Clerk so they are never intercepted
  app.register(async (healthApp) => {
    healthApp.get('/health', async () => {
      return { status: 'ok', timestamp: new Date() };
    });

    healthApp.get('/health/ready', async (_request, reply) => {
      const mongoose = (await import('mongoose')).default;
      const isDbReady = mongoose.connection.readyState === 1;

      if (isDbReady) {
        return { status: 'ready', timestamp: new Date() };
      } else {
        return reply.status(503).send({ status: 'not_ready', message: 'Database not connected' });
      }
    });
  });

  // Clerk — pass keys explicitly so it doesn't rely on process.env auto-detection
  app.register(clerkPlugin, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });

  // Global Error Handler
  setupErrorHandler(app);

  // Routes
  app.register(async (api) => {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(walletRoutes, { prefix: '/wallet' });
    api.register(discoveryRoutes, { prefix: '/discovery' });
    api.register(matchRoutes, { prefix: '/match' });
    api.register(roomRoutes, { prefix: '/rooms' });
  }, { prefix: `/api/${env.API_VERSION}` });

  return app;
}
