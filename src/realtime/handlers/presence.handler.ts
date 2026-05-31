import { Server, Socket } from 'socket.io';
import { redis } from '../../config/redis';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { logger } from '../../utils/logger';

const PRESENCE_TTL_SECONDS = 30;

export function registerPresenceHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  // Set initial presence and broadcast
  const presenceKey = `presence:${userId}`;
  redis.setex(presenceKey, PRESENCE_TTL_SECONDS, 'online')
    .then(() => {
      io.emit(SOCKET_EVENTS.PRESENCE_UPDATE, { userId, status: 'online' });
    })
    .catch(err => logger.error({ err }, 'Failed to set presence'));

  // Heartbeat refresh
  socket.on(SOCKET_EVENTS.PRESENCE_HEARTBEAT, () => {
    redis.expire(presenceKey, PRESENCE_TTL_SECONDS).catch(err => {
      logger.error({ err }, 'Failed to refresh presence TTL');
    });
  });

  // Handle disconnect
  socket.on('disconnecting', () => {
    redis.del(presenceKey)
      .then(() => {
        io.emit(SOCKET_EVENTS.PRESENCE_UPDATE, { userId, status: 'offline' });
      })
      .catch(err => logger.error({ err }, 'Failed to clear presence on disconnect'));
  });
}
