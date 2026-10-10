import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
  /**
   * The reference a person can quote.
   *
   * Chats were identified only by their database id, which nobody reads out
   * over a phone and which the apps never showed - so a rider and an admin
   * talking about "the chat" had no way to be sure they meant the same one.
   */
  ticketNumber: {
    type: String,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Support ticket must have a user'],
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters'],
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  category: {
    type: String,
    enum: ['general', 'technical', 'billing', 'order', 'account', 'feature-request', 'bug-report', 'rider_chat'],
    default: 'general',
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  adminResponse: {
    type: String,
    default: '',
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  responseAt: {
    type: Date,
    default: null,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  // For tracking conversation history
  conversation: [{
    message: String,
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

// Add indexes for better query performance
supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, status: 1 });

/*
 * Numbered before validation, not before save.
 *
 * Mongoose validates first, so a required field filled in by a pre('save')
 * hook fails validation every time and the document is never written.
 */
supportTicketSchema.pre('validate', function assignTicketNumber(next) {
  if (!this.ticketNumber) {
    const stamp = Date.now().toString(36).toUpperCase().slice(-6);
    const salt = Math.random().toString(36).toUpperCase().slice(2, 5);
    this.ticketNumber = `CHT-${stamp}${salt}`;
  }
  next();
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
