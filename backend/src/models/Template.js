import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, trim: true, default: '' },
    htmlBody: { type: String, default: '' },
    /** html | block */
    kind: { type: String, enum: ['html', 'block'], default: 'html' },
    blockId: { type: String, default: '', trim: true },
    /** Incremented on each save for audit trail. */
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

templateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Template = mongoose.model('Template', templateSchema);
