import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      mongoose.connection.on('connected', () => {
        logger.info('✅ MongoDB connected');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('❌ MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
      });

      await mongoose.connect(env.MONGODB_URI, {
        autoIndex: true, // In production, usually false, but fine for MVP
      });
      break;
    } catch (error) {
      logger.error({ err: error }, '❌ Failed to connect to MongoDB, retrying...');
      retries -= 1;
      await new Promise(res => setTimeout(res, 5000));
    }
  }

  if (retries === 0) {
    logger.fatal('❌ Could not connect to MongoDB after multiple retries. Exiting.');
    process.exit(1);
  }
};
