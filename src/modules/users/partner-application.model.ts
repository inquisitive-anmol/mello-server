import mongoose, { Schema, Document } from 'mongoose';

export interface IPartnerApplication extends Document {
  userId: mongoose.Types.ObjectId;
  realName: string;
  languages: string[];
  gender: 'male' | 'female' | 'other';
  dob: string;
  bio: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const partnerApplicationSchema = new Schema<IPartnerApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    realName: { type: String, required: true },
    languages: { type: [{ type: String }], required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    dob: { type: String, required: true },
    bio: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export const PartnerApplication = mongoose.model<IPartnerApplication>('PartnerApplication', partnerApplicationSchema);
