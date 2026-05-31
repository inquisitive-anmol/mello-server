import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { logger } from '../../utils/logger';

export function registerRoomHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  socket.on(SOCKET_EVENTS.ROOM_JOIN, ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    logger.info({ userId, roomId }, 'User joined socket room');
  });

  socket.on(SOCKET_EVENTS.ROOM_LEAVE, ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    logger.info({ userId, roomId }, 'User left socket room');
  });
}
