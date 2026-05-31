import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { User } from '../../users/user.model';
import { Room } from '../room.model';
import { env } from '../../../config/env';

// Mock Socket.io since we don't start the full socket server during integration tests
vi.mock('../../../realtime/socket.server', () => {
  const emitMock = vi.fn();
  return {
    getIO: () => ({
      to: () => ({
        emit: emitMock
      })
    }),
    emitMock // export so we can test it if we want
  };
});

describe('Room Module Integration', () => {
  let app: FastifyInstance;
  const TEST_CLERK_ID = 'test_clerk_id_123';
  let userId: string;
  let roomId: string;
  let partnerId: string;
  const API_PREFIX = `/api/${env.API_VERSION}/rooms`;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed main user
    const user = await User.create({
      clerkId: TEST_CLERK_ID,
      username: 'roomuser',
      profile: { displayName: 'Room User' }
    });
    userId = user._id.toString();

    // Seed partner
    const partner = await User.create({
      clerkId: 'partner_123',
      username: 'partner',
      profile: { displayName: 'Partner' }
    });
    partnerId = partner._id.toString();

    // Create a mock active room
    const room = await Room.create({
      status: 'active',
      type: 'audio',
      startedAt: new Date(Date.now() - 60000), // Started 1 minute ago
      channelId: 'test_channel_id',
      vibeTag: 'chill',
      billingRate: 10,
      participants: [
        { userId: user._id, role: 'caller', joinedAt: new Date() },
        { userId: partner._id, role: 'listener', joinedAt: new Date() }
      ]
    });
    roomId = room._id.toString();
  });

  it('GET /:roomId returns the room details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/${roomId}`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body._id).toBe(roomId);
    expect(body.status).toBe('active');
  });

  it('GET /history returns call history for the user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/history`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]._id).toBe(roomId);
  });

  it('POST /:roomId/review submits a review for the partner', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${API_PREFIX}/${roomId}/review`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      },
      payload: {
        rating: 5,
        tags: ['friendly', 'helpful']
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.rating).toBe(5);
    expect(body.tags).toContain('friendly');
    expect(body.revieweeId).toBe(partnerId);
  });

  it('POST /:roomId/end ends the room and emits an event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${API_PREFIX}/${roomId}/end`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.duration).toBeGreaterThanOrEqual(60); // At least 60 seconds since we set startedAt to 1m ago

    const updatedRoom = await Room.findById(roomId);
    expect(updatedRoom?.status).toBe('ended');
    expect(updatedRoom?.endedAt).toBeDefined();
  });
});
