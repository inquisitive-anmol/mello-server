import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { logger } from '../../utils/logger';
import { billingQueue } from '../../jobs/queue';

export function registerCallHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  socket.on(SOCKET_EVENTS.CALL_ACCEPT, async ({ roomId, callerId }) => {
    logger.info({ userId, roomId, callerId }, 'Call accepted');
    
    // Start the billing cycle repeatable job (every 60 seconds)
    // Job ID is based on roomId so we can easily remove it later or let it naturally expire when room status changes
    await billingQueue.add('charge', { roomId }, {
      jobId: `billing:${roomId}`,
      repeat: {
        every: 60000 // 60 seconds
      }
    });

    io.to(roomId).emit(SOCKET_EVENTS.CALL_CONNECTED, { roomId });
  });

  socket.on(SOCKET_EVENTS.CALL_REJECT, ({ roomId, callerId }) => {
    logger.info({ userId, roomId, callerId }, 'Call rejected');
    // Notify caller that call was rejected
    // Could be done by emitting to the specific caller's socket, but for MVP room broadcast is fine
    io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, { roomId, duration: 0, coinsDeducted: 0 });
  });
}
