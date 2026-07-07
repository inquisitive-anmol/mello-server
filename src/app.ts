import fastify from 'fastify';
import cors from '@fastify/cors';
import { setupErrorHandler } from './middleware/error.middleware';
import { env } from './config/env';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';

import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/user.routes';
import { walletRoutes } from './modules/wallet/wallet.routes';

import { discoveryRoutes } from './modules/discovery/discovery.routes';

import { matchRoutes } from './modules/match/match.routes';

import { roomRoutes } from './modules/rooms/room.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { livekitWebhook } from './modules/rooms/webhook.controller';

import { setupAdmin } from './admin/admin.setup';

export async function buildApp() {
  const app = fastify({
    logger: false, // We're using a custom pino logger
  });


  // Plugins
  app.register(cors, {
    origin: env.CORS_ORIGINS,
  });

  app.register(require('@fastify/rate-limit'), {
    max: 100, // 100 requests
    timeWindow: '1 minute'
  });

  // C-1: Capture rawBody for LiveKit webhook signature verification.
  // LiveKit sends the payload as a plain-text signed JWT; we need the exact bytes
  // that were signed to run WebhookReceiver.receive() successfully.
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    done(null, body);
  });
  // Also handle plain text format that LiveKit may use
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    done(null, body);
  });



  app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/assets/',
    decorateReply: false,
  });

  app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
    decorateReply: false,
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


  // Global Error Handler
  setupErrorHandler(app);

  // Routes
  app.register(async (api) => {
    
    // Register multipart inside the API scope so it's available to all our routes
    // but DOES NOT conflict with AdminJS registering it on the global app scope
    await api.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      }
    });

    api.register(authRoutes, { prefix: '/auth' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(walletRoutes, { prefix: '/wallet' });
    api.register(discoveryRoutes, { prefix: '/discovery' });
    api.register(matchRoutes, { prefix: '/match' });
    api.register(roomRoutes, { prefix: '/rooms' });
    api.register(chatRoutes, { prefix: '/chat' });

    // C-1: LiveKit webhook — no auth middleware, the signed JWT body IS the auth
    api.post('/webhooks/livekit', livekitWebhook);
  }, { prefix: `/api/${env.API_VERSION}` });

  await setupAdmin(app);

  return app;
}
