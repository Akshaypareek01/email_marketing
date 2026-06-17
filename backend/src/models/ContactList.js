import mongoose from 'mongoose';

const contactListSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

contactListSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const ContactList = mongoose.model('ContactList', contactListSchema);
