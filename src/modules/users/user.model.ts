import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  username: string;
  profile: {
    displayName: string;
    avatarUrl: string;
    bio: string;
    vibeTags: string[];
    languages: string[];
    location?: {
      city: string;
      country: string;
    };
  };
  settings: {
    isListener: boolean;
    isAvailable: boolean;
    callRate: number;
    videoEnabled: boolean;
    isVerified: boolean;
  };
  metrics: {
    totalHangoutMinutes: number;
    totalCallsCompleted: number;
    rating: number;
    reviewCount: number;
  };
  status: 'active' | 'suspended' | 'deactivated';
  likedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    phoneNumber: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    profile: {
      displayName: { type: String, default: '' },
      avatarUrl: { type: String, default: '' },
      bio: { type: String, default: '' },
      vibeTags: { type: [{ type: String }], default: [], index: true }, // Multikey index
      languages: { type: [{ type: String }], default: [] },
      location: {
        city: { type: String },
        country: { type: String },
      },
    },
    settings: {
      isListener: { type: Boolean, default: false },
      isAvailable: { type: Boolean, default: false },
      callRate: { type: Number, default: 0 },
      videoEnabled: { type: Boolean, default: false },
      isVerified: { type: Boolean, default: false },
    },
    metrics: {
      totalHangoutMinutes: { type: Number, default: 0 },
      totalCallsCompleted: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },
      reviewCount: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deactivated'],
      default: 'active',
    },
    likedBy: { type: [{ type: String }], default: [] },
  },
  { timestamps: true }
);

// Compound index for discovery queries
userSchema.index({ 'settings.isListener': 1, 'settings.isAvailable': 1 });

export const User = mongoose.model<IUser>('User', userSchema);
