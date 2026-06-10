import mongoose, { Schema, Document } from 'mongoose';

export interface IOTP extends Document {
  phoneNumber: string;
  otp: string;
  expiresAt: Date;
  createdAt: Date;
}

const otpSchema = new Schema<IOTP>(
  {
    phoneNumber: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: '5m' } },
  },
  { timestamps: true }
);

export const OTP = mongoose.model<IOTP>('OTP', otpSchema);
