import { Wallet } from './wallet.model';
import { WalletLedger } from './wallet-ledger.model';
import { RedisLock } from '../../shared/utils/redis-lock';
import mongoose from 'mongoose';

export class WalletService {
  static async getBalance(userId: string) {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      // Lazy creation of wallet on first read
      wallet = await Wallet.create({ userId, balance: 0 });
    }
    return parseFloat(wallet.balance.toString());
  }

  static async credit(
    userId: string,
    amount: number,
    purpose: 'topup' | 'gift_received' | 'refund' | 'admin_credit' | 'call_earnings',
    referenceId?: string,
    metadata?: Record<string, unknown>
  ) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const lock = new RedisLock(`wallet:${userId}`);
    const acquired = await lock.acquire();
    if (!acquired) {
      throw new Error('Could not acquire lock on wallet for credit');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0 });
        await wallet.save({ session });
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const newBalance = currentBalance + amount;

      wallet.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
      wallet.version += 1;
      await wallet.save({ session });

      await WalletLedger.create(
        [
          {
            walletId: wallet._id,
            userId,
            type: 'CREDIT',
            amount,
            balanceAfter: newBalance,
            purpose,
            referenceId,
            metadata,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return { success: true, newBalance };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
      await lock.release();
    }
  }

  static async debit(
    userId: string,
    amount: number,
    purpose: 'call_charge' | 'gift_sent',
    referenceId?: string,
    metadata?: Record<string, unknown>
  ) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const lock = new RedisLock(`wallet:${userId}`);
    const acquired = await lock.acquire();
    if (!acquired) {
      throw new Error('Could not acquire lock on wallet for debit');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const newBalance = currentBalance - amount;

      wallet.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
      wallet.version += 1;
      await wallet.save({ session });

      await WalletLedger.create(
        [
          {
            walletId: wallet._id,
            userId,
            type: 'DEBIT',
            amount,
            balanceAfter: newBalance,
            purpose,
            referenceId,
            metadata,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return { success: true, newBalance };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
      await lock.release();
    }
  }
}
