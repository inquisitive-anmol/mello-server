import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  roomId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  revieweeId: mongoose.Types.ObjectId;
  rating: number;
  tags: string[];
  createdAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    tags: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Review = mongoose.model<IReview>('Review', reviewSchema);
