export const SOCKET_EVENTS = {
  // Client -> Server
  PRESENCE_HEARTBEAT: 'presence:heartbeat',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',

  // Server -> Client
  MATCH_FOUND: 'match:found',
  MATCH_TIMEOUT: 'match:timeout',
  CALL_INCOMING: 'call:incoming',
  CALL_CONNECTED: 'call:connected',
  CALL_ENDED: 'call:ended',
  COIN_BALANCE_UPDATE: 'coin:balance-update',
  PRESENCE_UPDATE: 'presence:update',
} as const;
