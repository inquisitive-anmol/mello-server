# Mello Backend — Production-Grade Architecture & Implementation Plan

## Background

Mello is a voice-first, real-time social platform. The backend must serve two distinct workload types simultaneously:

- **Stateless / High-throughput**: Auth, profiles, wallet transactions, vibe discovery (REST API)
- **Stateful / Low-latency**: Matchmaking queues, live room state, WebSocket signaling (Real-Time Layer)

This plan is scoped for **MVP delivery** but architected for **horizontal scale** from day one. Every decision avoids lock-in and leaves clear upgrade paths.

---

## Tech Stack — Final Decisions

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Non-blocking I/O, massive ecosystem, perfect for I/O-bound workloads |
| Framework | **Fastify** (not Express) | 3-4x faster than Express, native TypeScript, schema-first validation via Zod/AJV |
| Language | **TypeScript (strict)** | Type safety across codebase, better DX, catches schema mismatches at compile time |
| Real-Time | **Socket.io v4** | Bi-directional events, room support, Redis adapter for horizontal scaling |
| Auth | **Clerk** | JWT verification via `@clerk/fastify`, webhooks for user sync |
| Voice | **Agora RTC** | Token generation only — audio routing offloaded entirely to Agora infrastructure |
| Primary DB | **MongoDB 7** with Mongoose | Document model fits polymorphic social data; replica set from day one |
| Cache / Broker | **Redis 7 (Redis Stack)** | Session cache, Pub/Sub for Socket.io adapter, distributed locks, BullMQ |
| Job Queue | **BullMQ** | Redis-backed queue for matchmaking and async tasks — battle-tested |
| Reverse Proxy | **Nginx** | SSL termination, rate limiting, path-based routing to services |
| Containerization | **Docker + Docker Compose** | Isolated networks, reproducible environments, zero public DB exposure |
| Process Manager | **PM2** (inside container) | Cluster mode, graceful reloads, log management |
| Monitoring | **Prometheus + Grafana** (Phase 2) | Start with structured JSON logs via `pino` |
| Testing | **Vitest + Supertest** | Fast unit tests, HTTP integration tests |

---

## System Architecture Diagram

```
                        [ React Native Client ]
                                 │
              ┌──────────────────┴──────────────────┐
         HTTPS/REST                           WebSocket (wss://)
              │                                      │
              ▼                                      ▼
     ┌─────────────────────────────────────────────────────┐
     │            Nginx (Port 80 / 443 public)             │
     │   SSL Termination │ Rate Limiting │ Path Routing     │
     └──────────┬────────────────────────┬─────────────────┘
                │ /api/v1/*              │ /socket.io/*
                ▼                        ▼
     ┌──────────────────┐    ┌───────────────────────────┐
     │  Fastify REST    │    │   Socket.io Server         │
     │  API Gateway     │    │  (Clustered via PM2)       │
     │  (Stateless)     │    │  Redis Adapter attached    │
     └────────┬─────────┘    └──────────┬────────────────┘
              │                         │
              └──────────┬──────────────┘
                         │
         ┌───────────────┼──────────────────┐
         ▼               ▼                  ▼
  ┌────────────┐  ┌─────────────┐  ┌───────────────────┐
  │  MongoDB   │  │  Redis 7    │  │  BullMQ Workers   │
  │  Replica   │  │  (Cache,    │  │  (Matchmaking,    │
  │  Set       │  │  Pub/Sub,   │  │  Coin Billing,    │
  │            │  │  Locks)     │  │  Notifications)   │
  └────────────┘  └─────────────┘  └────────┬──────────┘
                                            │
                                   ┌────────┴──────────┐
                                   ▼                   ▼
                             [ Agora API ]      [ Clerk Webhooks ]
                            (RTC Token Gen)    (User Sync Events)
```

---

## Repository Structure (`d:\Projects\mello\server\`)

```
server/
├── src/
│   ├── config/
│   │   ├── env.ts                  # Zod-validated env schema (fail-fast on startup)
│   │   ├── database.ts             # MongoDB connection with retry logic
│   │   ├── redis.ts                # Redis client singleton
│   │   └── agora.ts                # Agora token generation utilities
│   │
│   ├── modules/                    # Feature-first module organization
│   │   ├── auth/
│   │   │   ├── auth.routes.ts      # Clerk webhook ingestion
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.service.ts     # User sync from Clerk events
│   │   │
│   │   ├── users/
│   │   │   ├── user.model.ts       # Mongoose schema
│   │   │   ├── user.routes.ts
│   │   │   ├── user.controller.ts
│   │   │   └── user.service.ts
│   │   │
│   │   ├── wallet/
│   │   │   ├── wallet.model.ts
│   │   │   ├── wallet-ledger.model.ts
│   │   │   ├── wallet.routes.ts
│   │   │   ├── wallet.controller.ts
│   │   │   └── wallet.service.ts   # Atomic debit/credit with Redis lock
│   │   │
│   │   ├── match/
│   │   │   ├── match.routes.ts     # POST /match/join, DELETE /match/leave
│   │   │   ├── match.controller.ts
│   │   │   ├── match.service.ts    # Queue ingestion logic
│   │   │   └── match.worker.ts     # BullMQ worker — matching algorithm
│   │   │
│   │   ├── rooms/
│   │   │   ├── room.model.ts       # Persisted room metadata
│   │   │   ├── room.routes.ts
│   │   │   ├── room.controller.ts
│   │   │   └── room.service.ts     # RTC token gen, room lifecycle
│   │   │
│   │   └── discovery/
│   │       ├── discovery.routes.ts # GET /vibes, GET /listeners/live
│   │       ├── discovery.controller.ts
│   │       └── discovery.service.ts # Reads cached live state from Redis
│   │
│   ├── realtime/
│   │   ├── socket.server.ts        # Socket.io init + Redis adapter attachment
│   │   ├── socket.middleware.ts    # Clerk JWT verification for WS handshake
│   │   └── handlers/
│   │       ├── room.handler.ts     # join-room, leave-room, vibe-update events
│   │       ├── call.handler.ts     # call-ringing, call-accepted, call-rejected
│   │       └── presence.handler.ts # online status, heartbeat
│   │
│   ├── jobs/
│   │   ├── queue.ts                # BullMQ queue definitions
│   │   ├── matchmaking.worker.ts   # Match processor
│   │   ├── billing.worker.ts       # Per-second coin deduction during calls
│   │   └── notification.worker.ts  # Push notification dispatch
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts      # Clerk JWT guard (Fastify preHandler hook)
│   │   ├── rate-limit.middleware.ts
│   │   └── error.middleware.ts     # Global Fastify error handler
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   ├── api.types.ts        # Request/Response interfaces
│   │   │   └── events.types.ts     # Socket event payload types
│   │   ├── utils/
│   │   │   ├── logger.ts           # Pino logger singleton
│   │   │   ├── redis-lock.ts       # Redlock distributed lock utility
│   │   │   └── pagination.ts       # Cursor-based pagination helpers
│   │   └── constants/
│   │       ├── queue-names.ts
│   │       └── socket-events.ts    # Single source of truth for WS event names
│   │
│   ├── app.ts                      # Fastify app factory (registers plugins, routes)
│   └── server.ts                   # Entry point — binds to port, starts workers
│
├── tests/
│   ├── unit/
│   │   ├── wallet.service.test.ts
│   │   └── match.service.test.ts
│   └── integration/
│       ├── auth.routes.test.ts
│       └── wallet.routes.test.ts
│
├── docker/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── Dockerfile
│   └── mongo/
│       └── init-replica.js         # Replica set initialization script
│
├── Dockerfile                      # Multi-stage Node.js build
├── docker-compose.yml              # Full local stack
├── docker-compose.prod.yml         # Production overrides
├── .env.example
├── package.json
└── tsconfig.json
```

---

## MongoDB Schema Blueprint (Expanded)

### `users` Collection
```typescript
{
  _id: ObjectId,
  clerkId: string,           // Clerk user ID — indexed, unique
  username: string,          // unique
  profile: {
    displayName: string,
    avatarUrl: string,
    bio: string,
    vibeTags: string[],      // ["tech", "indie", "late-night"]
    languages: string[],     // ["en", "hi"]
    location: {              // Optional, for proximity matching
      city: string,
      country: string,
    }
  },
  settings: {
    isListener: boolean,     // Can be discovered as a listener
    isAvailable: boolean,    // Currently accepting calls
    callRate: number,        // Coins per minute
    videoEnabled: boolean,
  },
  metrics: {
    totalHangoutMinutes: number,
    totalCallsCompleted: number,
    rating: number,          // Aggregate score, updated by worker
    reviewCount: number,
  },
  status: "active" | "suspended" | "deactivated",
  createdAt: Date,
  updatedAt: Date,
}
```
**Indexes**: `clerkId (unique)`, `username (unique)`, `settings.isListener + settings.isAvailable` (compound for discovery queries), `profile.vibeTags (multikey)`

### `wallets` Collection
```typescript
{
  _id: ObjectId,
  userId: ObjectId,          // ref: users — indexed, unique
  balance: Decimal128,       // Use Decimal128, never float for money
  currency: "INR" | "USD",
  version: number,           // Optimistic locking field
  updatedAt: Date,
}
```
**Indexes**: `userId (unique)`

### `wallet_ledger` Collection (Append-Only)
```typescript
{
  _id: ObjectId,
  walletId: ObjectId,        // ref: wallets
  userId: ObjectId,          // Denormalized for fast per-user queries
  type: "CREDIT" | "DEBIT",
  amount: Decimal128,
  balanceAfter: Decimal128,  // Snapshot for audit trail
  purpose: "topup" | "call_charge" | "gift_sent" | "gift_received" | "refund",
  referenceId: string,       // roomId, paymentOrderId, etc.
  metadata: Record<string, unknown>,
  timestamp: Date,
}
```
**Indexes**: `userId + timestamp (compound)`, `walletId`

### `rooms` Collection
```typescript
{
  _id: ObjectId,
  channelId: string,         // Agora channel ID — unique
  participants: [{
    userId: ObjectId,
    role: "caller" | "listener",
    joinedAt: Date,
    leftAt?: Date,
  }],
  status: "active" | "ended",
  vibeTag: string,
  billingRate: number,       // Coins/min at time of room creation
  totalDuration: number,     // Seconds, computed on end
  startedAt: Date,
  endedAt?: Date,
}
```

### `reviews` Collection
```typescript
{
  _id: ObjectId,
  roomId: ObjectId,
  reviewerId: ObjectId,
  revieweeId: ObjectId,
  rating: number,            // 1-5
  tags: string[],            // ["great listener", "funny"]
  createdAt: Date,
}
```

---

## REST API Surface (`/api/v1/`)

### Auth Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/webhook/clerk` | Clerk-Signature | Syncs Clerk user create/update/delete events to MongoDB |

### Users Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | JWT | Get own profile |
| PATCH | `/users/me` | JWT | Update profile, vibe tags, settings |
| GET | `/users/:username` | JWT | Get public profile |
| PATCH | `/users/me/availability` | JWT | Toggle isAvailable status |

### Wallet Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/wallet/balance` | JWT | Current coin balance |
| GET | `/wallet/transactions` | JWT | Paginated ledger history |
| POST | `/wallet/topup/initiate` | JWT | Create payment order (Razorpay/Stripe) |
| POST | `/wallet/topup/verify` | JWT | Verify payment + credit coins |

### Match / Discovery Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/discovery/listeners` | JWT | List available listeners (from Redis cache) |
| GET | `/discovery/vibes` | Public | List available vibe/mood tags |
| POST | `/match/join` | JWT | Enter matchmaking queue → returns `202 Accepted` |
| DELETE | `/match/leave` | JWT | Exit matchmaking queue |
| POST | `/match/direct/:listenerId` | JWT | Direct call request to specific listener |

### Rooms Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/rooms/:roomId` | JWT | Get room metadata |
| POST | `/rooms/:roomId/end` | JWT | Trigger graceful room teardown |
| GET | `/rooms/history` | JWT | User's call history (paginated) |
| POST | `/rooms/:roomId/review` | JWT | Submit post-call review |

### RTC Module
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/rtc/token` | JWT | Generate short-lived Agora RTC token for a channelId |

---

## WebSocket Event Catalog

All event names are typed constants from `src/shared/constants/socket-events.ts`.

### Client → Server (Emit)
| Event | Payload | Description |
|---|---|---|
| `presence:heartbeat` | `{}` | Keep-alive, updates Redis TTL |
| `room:join` | `{ roomId }` | Join a Socket.io room namespace |
| `room:leave` | `{ roomId }` | Leave room namespace |
| `call:accept` | `{ roomId, callerId }` | Callee accepts direct call |
| `call:reject` | `{ roomId, callerId }` | Callee rejects direct call |

### Server → Client (Broadcast)
| Event | Payload | Description |
|---|---|---|
| `match:found` | `{ roomId, channelId, rtcToken, partnerProfile }` | Match result from BullMQ worker |
| `match:timeout` | `{}` | No match found within timeout window |
| `call:incoming` | `{ roomId, channelId, rtcToken, callerProfile }` | Direct call incoming |
| `call:connected` | `{ roomId }` | Both parties connected |
| `call:ended` | `{ roomId, duration, coinsDeducted }` | Room teardown signal |
| `coin:balance-update` | `{ newBalance }` | Real-time wallet update |
| `presence:update` | `{ userId, status }` | User online/offline |

---

## Matchmaking Engine — Algorithm Detail

### Queue Structure in Redis
```
Key: matchmaking:pool
Type: Redis Sorted Set
Score: Unix timestamp (FIFO ordering)
Value: JSON { userId, vibeTags, languagePref, callRate }
```

### Worker Logic (BullMQ Processor)
```
1. POLL: Every 500ms, the worker scans the pool for entries older than 2s
2. CANDIDATE SEARCH: For each queued user, query Redis pool for users with:
   - Overlapping vibeTags (at least 1 match)
   - Compatible callRate range (±20%)
   - Different userId
3. LOCK: Acquire Redis distributed lock on BOTH user IDs (prevents double-match)
   - Lock TTL: 10 seconds
   - Use Redlock algorithm across 3 Redis replicas in production
4. PAIR: If lock succeeds on both:
   - Generate unique channelId (UUID v4)
   - Call Agora token util for both users
   - Create Room document in MongoDB
   - Remove both from Redis pool
   - Emit `match:found` to both users via Socket.io
5. TIMEOUT: If user waits > 30s, emit `match:timeout`, remove from pool
```

---

## Wallet Debit Safety — During Active Calls

A critical flow: coins are charged per-minute during a live call without race conditions.

```
1. On `match:found`, a BullMQ repeatable job is created:
   Job: billing:charge, repeat every 60s, roomId in payload

2. Worker acquires Redis lock on walletId
3. Checks if room is still "active" in MongoDB
4. Debits (billingRate * 1) from wallet using MongoDB atomic findOneAndUpdate:
   { $inc: { balance: -amount }, $inc: { version: 1 } }
5. Inserts WalletLedger entry
6. Emits `coin:balance-update` to caller's socket
7. Releases lock

On room end: BullMQ job is drained/removed by roomId reference.
```

---

## Redis Key Taxonomy

```
# Presence
presence:{userId}              TTL: 30s — heartbeat-refreshed

# Matchmaking pool
matchmaking:pool               Sorted Set — active searchers

# Room state (fast access without DB)
room:state:{roomId}            Hash { status, startedAt, participantCount }

# Discovery cache
discovery:listeners            Sorted Set by rating — TTL 60s

# Distributed locks
lock:match:{userId}            TTL: 10s
lock:wallet:{walletId}         TTL: 5s

# Rate limiting
ratelimit:{ip}:{endpoint}      Counter — TTL: window duration
```

---

## Nginx Configuration Highlights

```nginx
# Path routing
location /api/ {
    proxy_pass http://fastify_api:3000;
    limit_req zone=api_limit burst=20 nodelay;
}

location /socket.io/ {
    proxy_pass http://fastify_api:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # No rate limiting on WS path
}

# Rate limit zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=wallet_limit:10m rate=10r/m;
```

---

## Docker Compose — Local Dev Stack

```yaml
# Services exposed internally only (no public ports):
#   - mongodb (27017)
#   - redis (6379)
#
# Services with public ports:
#   - nginx (80, 443) → routes to fastify
#
# Networks:
#   - mello_internal: mongodb, redis, fastify, workers all live here
#   - mello_public: nginx only
```

---

## Environment Variables (`.env.example`)

```
# Server
NODE_ENV=development
PORT=3000
API_VERSION=v1

# MongoDB
MONGODB_URI=mongodb://mongo:27017/mello?replicaSet=rs0

# Redis
REDIS_URL=redis://redis:6379

# Clerk
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Agora
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...

# Wallet
COIN_TO_CURRENCY_RATE=1     # 1 coin = ₹1

# Matchmaking
MATCH_TIMEOUT_SECONDS=30
MATCH_POLL_INTERVAL_MS=500
```

---

## MVP Scope vs. Scale Path

| Feature | MVP | Scale Path |
|---|---|---|
| Matchmaking | Single BullMQ worker | Worker pool with auto-scaling (PM2 cluster) |
| Socket.io | Single node | Redis adapter + multiple Node.js instances behind Nginx upstream |
| MongoDB | Standalone with replica set (for oplog) | Atlas M10+ or sharded cluster |
| Redis | Single Redis Stack instance | Redis Cluster or Redis Sentinel |
| Auth | Clerk (managed) | No change needed |
| Payment | Manual coin credit (MVP) | Razorpay/Stripe integration |
| Monitoring | Pino JSON logs | Prometheus + Grafana + Pino → Loki |
| Deployment | Docker Compose on single VPS | Kubernetes or AWS ECS |

---

## Implementation Phases

### Phase 1 — Foundation (Week 1)
- [ ] Repository scaffold with TypeScript, Fastify, Docker Compose
- [ ] MongoDB + Redis connection setup with retry logic
- [ ] Environment validation with Zod
- [ ] Clerk webhook ingestion → User sync to MongoDB
- [ ] JWT auth middleware (Fastify preHandler)
- [ ] User profile CRUD endpoints
- [ ] Pino logger + global error handler

### Phase 2 — Wallet Layer (Week 2)
- [ ] Wallet + WalletLedger models
- [ ] Balance read endpoint
- [ ] Atomic debit/credit service with Redis distributed lock
- [ ] Ledger history endpoint (cursor paginated)
- [ ] Manual topup endpoint (MVP: admin-triggered credit)

### Phase 3 — Real-Time Infrastructure (Week 2-3)
- [ ] Socket.io server with Clerk JWT handshake
- [ ] Redis adapter integration
- [ ] Presence heartbeat system
- [ ] Socket event handlers (room, call, presence)
- [ ] Discovery API with Redis-cached listener list

### Phase 4 — Matchmaking Engine (Week 3)
- [ ] BullMQ queue setup
- [ ] Matchmaking worker with Redlock
- [ ] Agora RTC token generation utility
- [ ] Room creation on match
- [ ] `match:found` / `match:timeout` Socket.io events

### Phase 5 — Call Lifecycle & Billing (Week 4)
- [ ] Call accept/reject flow
- [ ] Per-minute billing BullMQ repeatable job
- [ ] Room end + billing settlement
- [ ] Review submission post-call

### Phase 6 — Hardening (Ongoing)
- [ ] Nginx rate limiting
- [ ] Integration tests
- [ ] Health check endpoints (`/health`, `/health/ready`)
- [ ] Graceful shutdown handling

---

## Open Questions

> **Payment Gateway**: For the wallet top-up flow in MVP, should we integrate Razorpay (INR-native, simpler for India) or Stripe? Or stub it with a manual credit endpoint for MVP and defer payment integration?

> **Agora vs. LiveKit**: The research specifies Agora. Agora is proprietary, closed-source, and usage-based pricing can become expensive at scale. LiveKit (open-source, self-hostable) is a strong alternative. Confirm to stick with Agora for MVP.

> **Deployment Target for MVP**: Where will the initial VPS be hosted — AWS EC2, DigitalOcean Droplet, Hetzner? This affects the Docker Compose production config and SSL setup (Certbot vs. ACM).

> **Direct Calls**: The discovery screen shows individual listeners. Should `POST /match/direct/:listenerId` be in MVP scope, or do we build random matchmaking first and add direct calls later?
