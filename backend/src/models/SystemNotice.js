import mongoose from 'mongoose';

const systemNoticeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    /** Stable key for upserts (e.g. sending_paused, past_due). Omitted for one-off admin notices. */
    dedupeKey: { type: String, default: '', trim: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    severity: { type: String, enum: ['info', 'warning', 'danger'], default: 'info' },
    category: {
      type: String,
      enum: ['sending', 'billing', 'account', 'maintenance', 'admin'],
      default: 'admin',
    },
    actionHref: { type: String, default: '', trim: true },
    actionLabel: { type: String, default: '', trim: true },
    /** User IDs who dismissed this notice. */
    dismissedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    active: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

systemNoticeSchema.index({ tenantId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $ne: '' } } });
systemNoticeSchema.index({ tenantId: 1, active: 1, createdAt: -1 });

export const SystemNotice = mongoose.model('SystemNotice', systemNoticeSchema);
