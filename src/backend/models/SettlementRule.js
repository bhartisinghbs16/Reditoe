/**
 * Settlement Rules model for vendor payout automation
 */
import mongoose from 'mongoose';

const settlementRuleSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: [true, 'Settlement frequency is required'],
  },
  minimumThreshold: {
    type: Number,
    required: [true, 'Minimum threshold is required'],
    min: 0,
    default: 100,
  },
  settlementDay: {
    // For weekly: 1-7 (Mon-Sun), for monthly: 1-31
    type: Number,
    min: 1,
    max: 31,
  },
  settlementTime: {
    type: String,
    default: '00:00',
  },
  autoProcess: {
    type: Boolean,
    default: false,
  },
  notifyVendor: {
    type: Boolean,
    default: true,
  },
  notifyEmail: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastProcessed: {
    type: Date,
  },
  nextProcessDate: {
    type: Date,
  },
  processingHistory: [{
    processedAt: {
      type: Date,
      default: Date.now,
    },
    orderCount: Number,
    totalAmount: Number,
    commissionAmount: Number,
    netAmount: Number,
    status: {
      type: String,
      enum: ['success', 'failed', 'pending'],
      default: 'success',
    },
    transactionId: String,
    notes: String,
  }],
  customRules: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Calculate next process date based on frequency
settlementRuleSchema.methods.calculateNextProcessDate = function() {
  const now = new Date();
  let nextDate = new Date(now);

  switch (this.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      const daysUntilNext = this.settlementDay ? this.settlementDay - now.getDay() : 7;
      nextDate.setDate(now.getDate() + (daysUntilNext <= 0 ? 7 : daysUntilNext));
      break;
    case 'monthly':
      const targetDay = this.settlementDay || 1;
      if (now.getDate() >= targetDay) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      nextDate.setDate(targetDay);
      break;
  }

  // Set the time
  if (this.settlementTime) {
    const [hours, minutes] = this.settlementTime.split(':');
    nextDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }

  return nextDate;
};

// Update next process date
settlementRuleSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('frequency') || this.isModified('settlementDay') || this.isModified('settlementTime')) {
    this.nextProcessDate = this.calculateNextProcessDate();
  }
  next();
});

const SettlementRule = mongoose.model('SettlementRule', settlementRuleSchema);

export default SettlementRule;
