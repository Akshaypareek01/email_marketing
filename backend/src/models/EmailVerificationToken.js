import mongoose from 'mongoose';

const emailVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // SHA-256 hash of the 6-digit OTP code (not unique — codes collide across users).
    tokenHash: { type: String, required: true },
    // Failed attempts against this code; lets us lock out brute-force guessing.
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailVerificationSchema.index({ userId: 1, usedAt: 1 });
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken = mongoose.model('EmailVerificationToken', emailVerificationSchema);
