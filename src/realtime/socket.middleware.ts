import { Socket } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function requireSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    logger.warn({ socketId: socket.id }, 'Socket connection attempt without token');
    return next(new Error('Authentication error'));
  }

  try {
    const verifiedToken = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    socket.data.userId = verifiedToken.sub;
    next();
  } catch (error) {
    logger.error({ socketId: socket.id, err: error }, 'Socket token verification failed');
    next(new Error('Authentication error'));
  }
}
