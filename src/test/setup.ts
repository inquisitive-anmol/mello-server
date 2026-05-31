import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { env } from '../config/env';

// Mock Clerk Auth for testing
vi.mock('@clerk/fastify', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getAuth: (req: any) => {
      if (req.headers['x-no-auth']) {
        return { userId: null };
      }
      return { userId: req.headers['x-test-user-id'] || 'test_clerk_id_123' };
    }
  };
});

let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  // Start the memory server as a replica set (required for Mongoose transactions)
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();

  // Set the URI for the app to connect to
  env.MONGODB_URI = uri;
  
  // Optionally connect mongoose directly here as well to ensure it's ready
  await mongoose.connect(uri);
});

afterEach(async () => {
  // Clear all collections after each test
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
    }
  }
});

afterAll(async () => {
  // Disconnect and stop the memory server
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});
