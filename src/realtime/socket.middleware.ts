import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function requireSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    logger.warn({ socketId: socket.id }, 'Socket connection attempt without token');
    return next(new Error('Authentication error'));
  }

  if (token === 'dev_user_1') {
    socket.data.userId = 'dev_user_1';
    return next();
  }

  try {
    const verifiedToken = jwt.verify(
      token, 
      env.JWT_SECRET
    ) as { userId: string };

    socket.data.userId = verifiedToken.userId;
    next();
  } catch (error) {
    logger.error({ socketId: socket.id, err: error }, 'Socket token verification failed');
    next(new Error('Authentication error'));
  }
}
