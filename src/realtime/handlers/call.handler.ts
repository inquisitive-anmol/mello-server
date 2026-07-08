import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * Call signaling is handled exclusively through REST endpoints:
 *   POST /rooms/call/initiate      → initiates a call
 *   POST /rooms/call/:roomId/accept → callee accepts (mints token, starts billing)
 *   POST /rooms/call/:roomId/reject → callee declines
 *   POST /rooms/:roomId/end        → either party hangs up
 *
 * No socket events are used for call signaling to avoid bypassing
 * server-side auth, billing, and DB-write logic.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerCallHandlers(_io: Server, _socket: Socket) {
  // Intentionally empty — call lifecycle is managed via REST + webhook.
}
