import mongoose, { Schema, Document } from 'mongoose';

export interface IAppConfig extends Document {
  key: string;
  data: any;
}

const appConfigSchema = new Schema<IAppConfig>({
  key: { type: String, required: true, unique: true, index: true },
  data: { type: Schema.Types.Mixed, required: true },
});

export const AppConfig = mongoose.model<IAppConfig>('AppConfig', appConfigSchema);
