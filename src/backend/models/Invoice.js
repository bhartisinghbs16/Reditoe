/**
 * Invoice model for complete invoice management system
 */
import mongoose from 'mongoose';

const invoiceLineItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { _id: true });

const invoiceAddressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  zipCode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    default: 'India',
  },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  paymentTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialTransaction',
    index: true,
  },
  
  // Invoice status tracking
  status: {
    type: String,
    enum: ['generated', 'paid', 'pending', 'refunded', 'cancelled'],
    default: 'generated',
    index: true,
  },
  
  // Billing addresses
  billingAddress: invoiceAddressSchema,
  shippingAddress: invoiceAddressSchema,
  
  // Line items
  lineItems: [invoiceLineItemSchema],
  
  // Financial breakdown
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  grandTotal: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Tax calculation details
  taxDetails: {
    cgstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sgstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    igstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cgstRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    sgstRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    igstRate: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  
  // Payment information
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'online', 'wallet', 'mastercard', 'visa', 'paypal'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  
  // Dates
  issueDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  paidDate: {
    type: Date,
  },
  
  // Refund information
  refundInfo: {
    isRefunded: {
      type: Boolean,
      default: false,
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundReason: {
      type: String,
    },
    refundDate: {
      type: Date,
    },
    refundTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialTransaction',
    },
  },
  
  // Additional information
  notes: {
    type: String,
  },
  terms: {
    type: String,
  },
  
  // GST information (for Indian compliance)
  gstInfo: {
    customerGstNumber: String,
    vendorGstNumber: String,
    isReverseCharge: {
      type: Boolean,
      default: false,
    },
    placeOfSupply: String,
    taxType: {
      type: String,
      enum: ['GST', 'IGST', 'None'],
      default: 'GST',
    },
  },
  
  // Multi-tenant organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Generate sequential invoice number
invoiceSchema.pre('save', async function(next) {
  if (this.isNew && !this.invoiceNumber) {
    try {
      // Get the current year for invoice numbering
      const currentYear = new Date().getFullYear();
      const yearPrefix = currentYear.toString().slice(-2);
      
      // Find the highest invoice number for the current year
      const lastInvoice = await this.constructor
        .findOne({ invoiceNumber: new RegExp(`^INV${yearPrefix}`) })
        .sort({ invoiceNumber: -1 })
        .exec();
      
      let sequenceNumber = 1;
      if (lastInvoice) {
        const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-6));
        sequenceNumber = lastSequence + 1;
      }
      
      // Generate invoice number: INVYYMMDD-NNNNNN
      const today = new Date();
      const dateStr = today.getFullYear().toString().slice(-2) + 
                     (today.getMonth() + 1).toString().padStart(2, '0') + 
                     today.getDate().toString().padStart(2, '0');
      const sequenceStr = sequenceNumber.toString().padStart(6, '0');
      
      this.invoiceNumber = `INV${dateStr}-${sequenceStr}`;
    } catch (error) {
      return next(error);
    }
  }
  
  // Set due date (7 days from issue date by default)
  if (this.isNew && !this.dueDate) {
    this.dueDate = new Date(this.issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

// Indexes for efficient queries (only for fields without index: true)
invoiceSchema.index({ issueDate: -1 });
invoiceSchema.index({ organizationId: 1 });
invoiceSchema.index({ vendorId: 1 });

// Instance methods
invoiceSchema.methods.markAsPaid = function(paymentDate = new Date()) {
  this.status = 'paid';
  this.paymentStatus = 'paid';
  this.paidDate = paymentDate;
  return this.save();
};

invoiceSchema.methods.processRefund = function(refundAmount, reason) {
  this.refundInfo = {
    isRefunded: true,
    refundAmount,
    refundReason: reason,
    refundDate: new Date(),
  };
  this.status = 'refunded';
  this.paymentStatus = 'refunded';
  return this.save();
};

invoiceSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.notes = reason;
  return this.save();
};

// Static methods
invoiceSchema.statics.findByOrder = function(orderId) {
  return this.findOne({ orderId }).populate('customerId vendorId paymentTransactionId');
};

invoiceSchema.statics.findByCustomer = function(customerId, options = {}) {
  const query = { customerId };
  if (options.status) query.status = options.status;
  if (options.dateFrom) query.issueDate = { $gte: options.dateFrom };
  if (options.dateTo) query.issueDate = { ...query.issueDate, $lte: options.dateTo };
  
  return this.find(query).populate('orderId vendorId').sort({ issueDate: -1 });
};

invoiceSchema.statics.findByVendor = function(vendorId, options = {}) {
  const query = { vendorId };
  if (options.status) query.status = options.status;
  if (options.dateFrom) query.issueDate = { $gte: options.dateFrom };
  if (options.dateTo) query.issueDate = { ...query.issueDate, $lte: options.dateTo };
  
  return this.find(query).populate('orderId customerId').sort({ issueDate: -1 });
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
