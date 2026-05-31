import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { User } from '../../users/user.model';
import { env } from '../../../config/env';

describe('Discovery Module Integration', () => {
  let app: FastifyInstance;
  const TEST_CLERK_ID = 'test_clerk_id_123';
  const API_PREFIX = `/api/${env.API_VERSION}/discovery`;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed an active listener
    await User.create({
      clerkId: 'listener_123',
      username: 'listener1',
      profile: {
        displayName: 'Listener 1',
        vibeTags: ['chill'],
      },
      settings: {
        isListener: true,
        isAvailable: true,
      },
      metrics: {
        rating: 4.8,
      },
      status: 'active'
    });

    // Seed a user who is not a listener
    await User.create({
      clerkId: 'user_123',
      username: 'user1',
      profile: { displayName: 'User 1' },
      settings: {
        isListener: false,
        isAvailable: true,
      },
      status: 'active'
    });
  });

  it('GET /vibes returns public vibes list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/vibes`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('label');
  });

  it('GET /listeners returns available listeners for authenticated user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/listeners`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.length).toBeGreaterThan(0);
    
    // Ensure only the listener was returned
    const usernames = body.data.map((u: any) => u.username);
    expect(usernames).toContain('listener1');
    expect(usernames).not.toContain('user1');
  });

  it('GET /listeners returns 401 if unauthorized', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/listeners`,
      headers: {
        'x-no-auth': 'true'
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
