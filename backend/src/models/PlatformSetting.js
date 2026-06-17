import mongoose from 'mongoose';

const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const PlatformSetting = mongoose.model('PlatformSetting', platformSettingSchema);
