import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['credit', 'debit'],
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  // Reference to related entity
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  paymentId: {
    type: String,
  },
  refundId: {
    type: String,
  },
  // Transaction status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
  },
  // Additional metadata
  category: {
    type: String,
    enum: ['order_payment', 'wallet_topup', 'refund', 'withdrawal', 'bonus', 'penalty', 'referral'],
    default: 'order_payment',
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Balance snapshot
  balanceBefore: {
    type: Number,
    required: true,
  },
  balanceAfter: {
    type: Number,
    required: true,
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  completedAt: {
    type: Date,
  },
  // Additional fields for enhanced functionality
  isReversed: {
    type: Boolean,
    default: false,
  },
  reversedAt: {
    type: Date,
  },
  reversalReason: {
    type: String,
  },
  originalTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
  },
  // Processing details
  processor: {
    type: String,
    enum: ['cashfree', 'wallet', 'manual', 'system'],
    default: 'wallet',
  },
  processingFee: {
    type: Number,
    default: 0,
  },
  // Fraud detection
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  deviceId: {
    type: String,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better performance
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, category: 1, createdAt: -1 });
walletTransactionSchema.index({ paymentId: 1 });
walletTransactionSchema.index({ orderId: 1 });

// Virtual for formatted amount
walletTransactionSchema.virtual('formattedAmount').get(function() {
  return this.type === 'credit' ? `+₹${this.amount}` : `-₹${this.amount}`;
});

// Virtual for time ago
walletTransactionSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
});

// Pre-save middleware
walletTransactionSchema.pre('save', function(next) {
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

// Static methods
walletTransactionSchema.statics.findByUserId = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type,
    category,
    status,
    startDate,
    endDate,
  } = options;

  const query = { userId };

  if (type) query.type = type;
  if (category) query.category = category;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  
  const transactions = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await this.countDocuments(query);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

walletTransactionSchema.statics.getTransactionStats = async function(userId, period = 'month') {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: 'completed',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    period,
    startDate,
    endDate: now,
    credit: { amount: 0, count: 0 },
    debit: { amount: 0, count: 0 },
    net: 0,
  };

  stats.forEach(stat => {
    if (stat._id === 'credit') {
      result.credit = { amount: stat.totalAmount, count: stat.count };
    } else if (stat._id === 'debit') {
      result.debit = { amount: stat.totalAmount, count: stat.count };
    }
  });

  result.net = result.credit.amount - result.debit.amount;

  return result;
};

walletTransactionSchema.statics.getDailyStats = async function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: 'completed',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
          },
        },
        credit: {
          $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
        },
        debit: {
          $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  return stats;
};

walletTransactionSchema.statics.reverseTransaction = async function(transactionId, reason) {
  const transaction = await this.findById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.isReversed) {
    throw new Error('Transaction already reversed');
  }

  // Create reversal transaction
  const reversalTransaction = new this({
    userId: transaction.userId,
    type: transaction.type === 'credit' ? 'debit' : 'credit',
    amount: transaction.amount,
    description: `Reversal: ${transaction.description}`,
    category: 'refund',
    status: 'completed',
    balanceBefore: transaction.balanceAfter,
    balanceAfter: transaction.balanceBefore,
    originalTransactionId: transaction._id,
    reversalReason: reason,
    processor: 'system',
    completedAt: new Date(),
  });

  await reversalTransaction.save();

  // Mark original as reversed
  transaction.isReversed = true;
  transaction.reversedAt = new Date();
  transaction.reversalReason = reason;
  await transaction.save();

  return reversalTransaction;
};

// Instance methods
walletTransactionSchema.methods.reverse = async function(reason) {
  if (this.isReversed) {
    throw new Error('Transaction already reversed');
  }

  return await this.constructor.reverseTransaction(this._id, reason);
};

walletTransactionSchema.methods.isCompleted = function() {
  return this.status === 'completed';
};

walletTransactionSchema.methods.isPending = function() {
  return this.status === 'pending';
};

walletTransactionSchema.methods.canBeReversed = function() {
  return this.status === 'completed' && !this.isReversed;
};

// Transform method for API responses
walletTransactionSchema.methods.toAPIResponse = function() {
  return {
    id: this._id,
    type: this.type,
    amount: this.amount,
    formattedAmount: this.formattedAmount,
    description: this.description,
    category: this.category,
    status: this.status,
    balanceBefore: this.balanceBefore,
    balanceAfter: this.balanceAfter,
    orderId: this.orderId,
    paymentId: this.paymentId,
    refundId: this.refundId,
    createdAt: this.createdAt,
    completedAt: this.completedAt,
    timeAgo: this.timeAgo,
    isReversed: this.isReversed,
    reversalReason: this.reversalReason,
    processor: this.processor,
    processingFee: this.processingFee,
  };
};

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

export default WalletTransaction;
