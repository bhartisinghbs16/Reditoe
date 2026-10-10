/**
 * Vendor Support Ticket model for managing vendor support requests
 */
import mongoose from 'mongoose';

const ticketMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['vendor', 'admin'],
    required: true,
  },
  message: {
    type: String,
    required: [true, 'Message content is required'],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  attachments: [{
    filename: String,
    url: String,
    type: String,
  }],
}, {
  _id: true,
});

const vendorSupportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vendor ID is required'],
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Restaurant ID is required'],
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  category: {
    type: String,
    enum: [
      'payment_issue',
      'technical_problem',
      'account_issue',
      'order_dispute',
      'menu_update',
      'commission_query',
      'settlement_issue',
      'other'
    ],
    required: [true, 'Category is required'],
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'pending_vendor', 'resolved', 'closed'],
    default: 'open',
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  messages: [ticketMessageSchema],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Admin user
  },
  resolution: {
    type: String,
  },
  resolvedAt: {
    type: Date,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  satisfactionRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  satisfactionFeedback: {
    type: String,
  },
  tags: [String],
  internalNotes: {
    type: String,
  },
  escalationLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 3,
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Generate ticket number before saving
vendorSupportTicketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      }
    });
    this.ticketNumber = `VST-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Update lastActivityAt when messages are added
vendorSupportTicketSchema.methods.addMessage = function(sender, message, attachments = []) {
  this.messages.push({ sender, message, attachments });
  this.lastActivityAt = new Date();
  return this.save();
};

// Close ticket
vendorSupportTicketSchema.methods.closeTicket = function(resolution, resolvedBy) {
  this.status = 'closed';
  this.resolution = resolution;
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  return this.save();
};

const VendorSupportTicket = mongoose.model('VendorSupportTicket', vendorSupportTicketSchema);

export default VendorSupportTicket;
