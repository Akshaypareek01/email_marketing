import mongoose from 'mongoose';

const ticketMessageSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, enum: ['tenant', 'admin'], default: 'tenant' },
    body: { type: String, required: true, trim: true },
    attachments: {
      type: [
        {
          filename: { type: String, required: true, trim: true },
          contentType: { type: String, default: 'application/octet-stream' },
          content: { type: String, required: true },
          sizeBytes: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    messages: { type: [ticketMessageSchema], default: [] },
  },
  { timestamps: true }
);

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
