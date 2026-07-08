import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDB } from './config/database';
// DEFERRED: Random matchmaking algorithm not yet implemented
// import './jobs/matchmaking.worker';
import './jobs/billing.worker';
import './jobs/presence.worker';
import './jobs/call-timeout.worker'; // A-7: Persistent delayed job for 30s call auto-reject

import { initSocketServer } from './realtime/socket.server';

async function start() {
  const app = await buildApp();

  await connectDB();
  
  // Initialize WebSockets
  initSocketServer(app);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);

    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
      const { redis } = await import('./config/redis.js');
      redis.quit();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (err) {
    logger.fatal({ err }, '❌ Failed to start server');
    process.exit(1);
  }
}

start();
