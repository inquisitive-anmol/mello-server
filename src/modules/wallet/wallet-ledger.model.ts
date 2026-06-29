import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletLedger extends Document {
  walletId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId; // Denormalized for faster queries
  type: 'CREDIT' | 'DEBIT';
  amount: mongoose.Types.Decimal128;
  balanceAfter: mongoose.Types.Decimal128; // Snapshot for audit
  purpose: 'topup' | 'call_charge' | 'gift_sent' | 'gift_received' | 'refund' | 'admin_credit' | 'call_earnings';
  referenceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

const walletLedgerSchema = new Schema<IWalletLedger>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    balanceAfter: { type: Schema.Types.Decimal128, required: true },
    purpose: {
      type: String,
      enum: ['topup', 'call_charge', 'gift_sent', 'gift_received', 'refund', 'admin_credit', 'call_earnings'],
      required: true,
    },
    referenceId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Compound index for getting a user's recent transactions quickly
walletLedgerSchema.index({ userId: 1, timestamp: -1 });

export const WalletLedger = mongoose.model<IWalletLedger>('WalletLedger', walletLedgerSchema);
