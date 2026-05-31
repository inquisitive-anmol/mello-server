import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { User } from '../user.model';
import { env } from '../../../config/env';

describe('User Module Integration', () => {
  let app: FastifyInstance;
  const TEST_CLERK_ID = 'test_clerk_id_123';
  const API_PREFIX = `/api/${env.API_VERSION}/users`;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed a user for the tests
    await User.create({
      clerkId: TEST_CLERK_ID,
      username: 'testuser',
      profile: {
        displayName: 'Test User',
        avatarUrl: 'http://example.com/avatar.png',
        bio: 'Hello world',
        vibeTags: ['chill'],
        languages: ['en'],
      }
    });
  });

  it('GET /me returns the authenticated user profile', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/me`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.username).toBe('testuser');
    expect(body.clerkId).toBe(TEST_CLERK_ID);
  });

  it('GET /me returns 401 if unauthorized', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/me`,
      headers: {
        'x-no-auth': 'true' // Trigger mock to return no userId
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it('PATCH /me updates user profile', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `${API_PREFIX}/me`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      },
      payload: {
        'profile.bio': 'Updated bio'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.profile.bio).toBe('Updated bio');

    // Verify DB
    const dbUser = await User.findOne({ clerkId: TEST_CLERK_ID });
    expect(dbUser?.profile.bio).toBe('Updated bio');
  });

  it('GET /:username retrieves another user profile', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/testuser`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.username).toBe('testuser');
  });
});
