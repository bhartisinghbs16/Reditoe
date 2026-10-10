import mongoose from 'mongoose';

const vendorWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalId: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processed'],
      default: 'pending',
    },
    bankDetailsSnapshot: {
      accountHolderName: { type: String, trim: true, required: true },
      accountNumber: { type: String, trim: true, required: true },
      ifsc: { type: String, trim: true, required: true },
      bankName: { type: String, trim: true, required: true },
      branch: { type: String, trim: true },
    },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    transactionReference: { type: String, trim: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

vendorWithdrawalSchema.index({ vendorId: 1, createdAt: -1 });
vendorWithdrawalSchema.index({ status: 1, createdAt: -1 });

vendorWithdrawalSchema.pre('save', function (next) {
  if (this.isNew && !this.withdrawalId) {
    const stamp = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.withdrawalId = `VWD_${stamp}_${rnd}`;
  }
  next();
});

const VendorWithdrawal = mongoose.model('VendorWithdrawal', vendorWithdrawalSchema);
export default VendorWithdrawal;

