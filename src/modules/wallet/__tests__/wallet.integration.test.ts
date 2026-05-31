import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { User } from '../../users/user.model';
import { Wallet } from '../wallet.model';
import { WalletLedger } from '../wallet-ledger.model';
import { env } from '../../../config/env';
import mongoose from 'mongoose';

describe('Wallet Module Integration', () => {
  let app: FastifyInstance;
  const TEST_CLERK_ID = 'test_clerk_id_123';
  let userId: string;
  const API_PREFIX = `/api/${env.API_VERSION}/wallet`;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed a user for the tests
    const user = await User.create({
      clerkId: TEST_CLERK_ID,
      username: 'walletuser',
      profile: {
        displayName: 'Wallet User',
        avatarUrl: '',
        bio: '',
        vibeTags: [],
        languages: [],
      }
    });
    userId = user._id.toString();
  });

  it('GET /balance returns 0 for new user (lazy creation)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/balance`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.balance).toBe(0);

    // Verify wallet was lazily created
    const wallet = await Wallet.findOne({ userId });
    expect(wallet).toBeTruthy();
    expect(parseFloat(wallet!.balance.toString())).toBe(0);
  });

  it('POST /topup/manual adds funds to wallet', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${API_PREFIX}/topup/manual`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID // Normally an admin check, but currently just an authenticated endpoint
      },
      payload: {
        amount: 50,
        targetUserId: userId
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.newBalance).toBe(50);

    // Verify DB
    const wallet = await Wallet.findOne({ userId });
    expect(parseFloat(wallet!.balance.toString())).toBe(50);

    // Verify Ledger
    const ledger = await WalletLedger.findOne({ userId });
    expect(ledger).toBeTruthy();
    expect(parseFloat(ledger!.amount.toString())).toBe(50);
    expect(ledger?.type).toBe('CREDIT');
  });

  it('GET /transactions returns ledger history', async () => {
    // Seed some transactions
    const wallet = await Wallet.create({ userId, balance: mongoose.Types.Decimal128.fromString('100') });
    await WalletLedger.create([
      { walletId: wallet._id, userId, type: 'CREDIT', amount: 100, balanceAfter: 100, purpose: 'topup' }
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `${API_PREFIX}/transactions`,
      headers: {
        'x-test-user-id': TEST_CLERK_ID
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].amount).toEqual({ $numberDecimal: '100' });
    expect(body.data[0].type).toBe('CREDIT');
  });
});
