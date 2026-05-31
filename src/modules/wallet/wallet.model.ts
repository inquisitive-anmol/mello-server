import mongoose, { Schema, Document } from 'mongoose';

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  balance: mongoose.Types.Decimal128;
  currency: 'INR' | 'USD';
  version: number; // Optimistic locking
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Schema.Types.Decimal128, default: 0 },
    currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
    version: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema);
