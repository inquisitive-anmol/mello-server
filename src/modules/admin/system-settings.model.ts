import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  audioCallRatePerMinute: number;
  videoCallRatePerMinute: number;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    audioCallRatePerMinute: { type: Number, default: 15 },
    videoCallRatePerMinute: { type: Number, default: 30 },
  },
  { timestamps: true }
);

export const SystemSettings = mongoose.model<ISystemSettings>('SystemSettings', systemSettingsSchema);
