import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  channelId: string;
  participants: {
    userId: mongoose.Types.ObjectId;
    role: 'caller' | 'listener';
    joinedAt: Date;
    leftAt?: Date;
  }[];
  status: 'waiting' | 'active' | 'ended';
  vibeTag: string;
  billingRate: number;
  totalDuration: number;
  startedAt: Date;
  endedAt?: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    channelId: { type: String, required: true, unique: true },
    participants: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['caller', 'listener'], required: true },
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date },
      },
    ],
    status: { type: String, enum: ['waiting', 'active', 'ended'], default: 'active' },
    vibeTag: { type: String, required: true },
    billingRate: { type: Number, required: true },
    totalDuration: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: false }
);

export const Room = mongoose.model<IRoom>('Room', roomSchema);
