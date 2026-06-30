import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { FastifyInstance } from 'fastify';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { requireSocketAuth } from './socket.middleware';
import { registerPresenceHandlers } from './handlers/presence.handler';
import { registerRoomHandlers } from './handlers/room.handler';
import { registerCallHandlers } from './handlers/call.handler';
import { registerChatHandlers } from './handlers/chat.handler';

let io: SocketIOServer;

export function initSocketServer(app: FastifyInstance) {
  io = new SocketIOServer(app.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const pubClient = redis;
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  // Middleware for Clerk authentication
  io.use(requireSocketAuth);

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id, userId: socket.data.userId }, 'Socket connected');
    // Always join the personal userId room — handles both initial connect and reconnects
    socket.join(socket.data.userId);

    registerPresenceHandlers(io, socket);
    registerRoomHandlers(io, socket);
    registerCallHandlers(io, socket);
    registerChatHandlers(io, socket);

    // Gap 2: On client-side reconnect, the socket reconnects and fires 'connection' again
    // with a new socket ID, but the userId is preserved via auth middleware.
    // socket.join above guarantees they're back in their userId room immediately.

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId: socket.data.userId, reason }, 'Socket disconnected');
      // Presence disconnect logic is handled inside presence.handler via disconnecting event
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
