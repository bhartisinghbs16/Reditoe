import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD'],
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  // Additional fields for enhanced functionality
  isFrozen: {
    type: Boolean,
    default: false,
  },
  freezeReason: {
    type: String,
  },
  dailyLimit: {
    type: Number,
    default: 10000, // 10,000 INR daily limit
  },
  monthlyLimit: {
    type: Number,
    default: 100000, // 100,000 INR monthly limit
  },
  /**
   * Money in the wallet that the customer may not spend.
   *
   * Held by an admin - a disputed refund, a suspected chargeback - and
   * released again by them. It stays part of the balance, because it is still
   * the customer's money; it is simply not available to pay with, so every
   * spendable check reads balance minus this.
   */
  heldAmount: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Statistics
  totalSpent: {
    type: Number,
    default: 0,
  },
  totalAdded: {
    type: Number,
    default: 0,
  },
  lastTransactionAt: {
    type: Date,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better performance
walletSchema.index({ userId: 1, balance: -1 });
walletSchema.index({ lastUpdated: -1 });

// Virtual for checking if wallet is active
walletSchema.virtual('isActive').get(function() {
  return !this.isFrozen;
});

/**
 * What the customer can actually spend: the balance, less anything held, and
 * nothing at all while the wallet is frozen.
 */
walletSchema.virtual('spendable').get(function spendable() {
  if (this.isFrozen) return 0;
  return Math.max(0, Number(this.balance || 0) - Number(this.heldAmount || 0));
});

// Virtual for available balance
walletSchema.virtual('availableBalance').get(function() {
  return this.isFrozen ? 0 : this.balance;
});

// Pre-save middleware
walletSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Static methods
walletSchema.statics.findByUserId = async function(userId) {
  return await this.findOne({ userId }).lean();
};

walletSchema.statics.updateBalance = async function(userId, amount, type) {
  const update = type === 'credit' 
    ? { $inc: { balance: amount, totalAdded: amount } }
    : { $inc: { balance: -amount, totalSpent: amount } };

  return await this.findOneAndUpdate(
    { userId, isFrozen: false },
    {
      ...update,
      lastUpdated: new Date(),
      lastTransactionAt: new Date(),
    },
    { new: true, upsert: true }
  );
};

walletSchema.statics.checkBalance = async function(userId, amount) {
  const wallet = await this.findOne({ userId, isFrozen: false });
  return wallet && wallet.balance >= amount;
};

walletSchema.statics.freezeWallet = async function(userId, reason) {
  return await this.findOneAndUpdate(
    { userId },
    { 
      isFrozen: true, 
      freezeReason: reason,
      lastUpdated: new Date(),
    },
    { new: true }
  );
};

walletSchema.statics.unfreezeWallet = async function(userId) {
  return await this.findOneAndUpdate(
    { userId },
    { 
      isFrozen: false, 
      freezeReason: null,
      lastUpdated: new Date(),
    },
    { new: true }
  );
};

walletSchema.statics.getWalletStats = async function(userId) {
  const wallet = await this.findOne({ userId }).lean();
  
  if (!wallet) {
    return {
      balance: 0,
      totalSpent: 0,
      totalAdded: 0,
      isActive: true,
    };
  }

  return {
    balance: wallet.balance,
    totalSpent: wallet.totalSpent,
    totalAdded: wallet.totalAdded,
    isActive: !wallet.isFrozen,
    isFrozen: wallet.isFrozen,
    freezeReason: wallet.freezeReason,
    lastUpdated: wallet.lastUpdated,
  };
};

// Instance methods
walletSchema.methods.canSpend = function(amount) {
  return !this.isFrozen && this.balance >= amount;
};

walletSchema.methods.spend = async function(amount) {
  if (this.isFrozen) {
    throw new Error('Wallet is frozen');
  }

  if (this.balance < amount) {
    throw new Error('Insufficient balance');
  }

  this.balance -= amount;
  this.totalSpent += amount;
  this.lastTransactionAt = new Date();
  this.lastUpdated = new Date();

  return await this.save();
};

walletSchema.methods.add = async function(amount) {
  if (this.isFrozen) {
    throw new Error('Wallet is frozen');
  }

  this.balance += amount;
  this.totalAdded += amount;
  this.lastTransactionAt = new Date();
  this.lastUpdated = new Date();

  return await this.save();
};

walletSchema.methods.freeze = async function(reason) {
  this.isFrozen = true;
  this.freezeReason = reason;
  this.lastUpdated = new Date();

  return await this.save();
};

walletSchema.methods.unfreeze = async function() {
  this.isFrozen = false;
  this.freezeReason = null;
  this.lastUpdated = new Date();

  return await this.save();
};

// Transform method for API responses
walletSchema.methods.toAPIResponse = function() {
  return {
    balance: this.balance,
    availableBalance: this.availableBalance,
    currency: this.currency,
    isActive: this.isActive,
    isFrozen: this.isFrozen,
    freezeReason: this.freezeReason,
    lastUpdated: this.lastUpdated,
    lastTransactionAt: this.lastTransactionAt,
    dailyLimit: this.dailyLimit,
    monthlyLimit: this.monthlyLimit,
  };
};

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
