import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { User } from '../../users/user.model';
import { env } from '../../../config/env';

describe('Match Module Integration', () => {
  let app: FastifyInstance;
  const TEST_CLERK_ID = 'test_clerk_id_123';
  const API_PREFIX = `/api/${env.API_VERSION}/match`;

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
      username: 'matchuser',
      profile: {
        displayName: 'Match User',
        vibeTags: ['chill', 'gaming'],
      },
      settings: {
        callRate: 15,
      }
    });
  });

  it('POST /join adds user to matchmaking queue', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${API_PREFIX}/join`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    // Our controller returns 202 Accepted
    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Joined matchmaking queue');
  });

  it('DELETE /leave removes user from matchmaking queue', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `${API_PREFIX}/leave`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Left matchmaking queue');
  });
});
