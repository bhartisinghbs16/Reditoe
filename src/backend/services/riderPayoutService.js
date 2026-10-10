import mongoose from 'mongoose';
import RiderWallet from '../models/RiderWallet.js';
import RiderWithdrawal from '../models/RiderWithdrawal.js';
import User from '../models/User.js';

const MIN_WITHDRAWAL_AMOUNT = 100;
const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;

const normalizeAutopayStateOnRider = (rider) => {
  if (!rider.bankDetails) rider.bankDetails = {};
  if (typeof rider.bankDetails.autopayEnabled !== 'boolean') rider.bankDetails.autopayEnabled = false;
  if (!rider.bankDetails.autopay) {
    rider.bankDetails.autopay = {
      eligible: false,
      reason: 'Bank account is not verified',
      lastEvaluatedAt: new Date(),
    };
  }
};

const maybeIdempotentExistingWithdrawal = async (riderId, amount) => {
  const from = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  return RiderWithdrawal.findOne({
    riderId,
    amount,
    createdAt: { $gte: from },
    status: { $in: ['pending', 'approved', 'processing', 'processed'] },
  }).sort({ createdAt: -1 });
};

export const getRiderBankDetailsView = (rider) => {
  const bank = rider?.bankDetails || {};
  return {
    accountHolderName: bank.accountHolderName || '',
    bankName: bank.bankName || '',
    ifscCode: bank.ifsc || bank.ifscCode || '',
    accountNumber: bank.accountNumber || '',
    isVerified: !!bank.isVerified,
    verificationStatus: bank.verificationStatus || (bank.isVerified ? 'verified' : 'pending'),
  };
};

export const updateRiderBankDetailsWithAutopay = async (rider, payload) => {
  const {
    accountHolderName,
    accountNumber,
    ifsc,
    bankName,
    branch,
    city,
    country,
  } = payload;

  if (!rider.bankDetails) rider.bankDetails = {};
  const previous = { ...rider.bankDetails };

  rider.bankDetails.accountHolderName = String(accountHolderName || '').trim();
  rider.bankDetails.accountNumber = String(accountNumber || '').replace(/\s/g, '');
  rider.bankDetails.ifsc = String(ifsc || '').toUpperCase().trim();
  rider.bankDetails.bankName = String(bankName || '').trim();
  rider.bankDetails.branch = String(branch || '').trim();
  rider.bankDetails.city = String(city || '').trim();
  rider.bankDetails.country = String(country || '').trim();

  const bankChanged =
    previous.accountHolderName !== rider.bankDetails.accountHolderName ||
    previous.accountNumber !== rider.bankDetails.accountNumber ||
    previous.ifsc !== rider.bankDetails.ifsc ||
    previous.bankName !== rider.bankDetails.bankName;

  // Bank changes invalidate verification until admin/system re-verifies.
  if (bankChanged) {
    rider.bankDetails.isVerified = false;
    rider.bankDetails.verificationStatus = 'pending';
  } else if (typeof rider.bankDetails.isVerified !== 'boolean') {
    rider.bankDetails.isVerified = false;
    rider.bankDetails.verificationStatus = 'pending';
  }

  normalizeAutopayStateOnRider(rider);
  rider.bankDetails.autopay.eligible = false;
  rider.bankDetails.autopay.reason = 'Autopay is disabled';
  rider.bankDetails.autopay.lastEvaluatedAt = new Date();
  rider.bankDetails.autopayEnabled = false;

  await rider.save();
  return getRiderBankDetailsView(rider);
};

export const createRiderWithdrawalRequest = async ({ riderId, amount }) => {
  if (!riderId) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (!amount || amount < MIN_WITHDRAWAL_AMOUNT) {
    const err = new Error(`Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`);
    err.statusCode = 400;
    throw err;
  }

  const dup = await maybeIdempotentExistingWithdrawal(riderId, amount);
  if (dup) {
    return {
      duplicate: true,
      withdrawal: dup,
    };
  }

  const existingPendingOrApproved = await RiderWithdrawal.findOne({
    riderId,
    status: { $in: ['pending', 'approved'] },
  }).sort({ createdAt: -1 });
  if (existingPendingOrApproved) {
    const err = new Error('You already have a pending withdrawal request');
    err.statusCode = 400;
    throw err;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const rider = await User.findById(riderId).session(session);
    if (!rider) {
      const err = new Error('Rider not found');
      err.statusCode = 404;
      throw err;
    }

    normalizeAutopayStateOnRider(rider);
    const hasBank =
      !!String(rider.bankDetails.accountHolderName || '').trim() &&
      !!String(rider.bankDetails.accountNumber || '').trim() &&
      !!String(rider.bankDetails.ifsc || rider.bankDetails.ifscCode || '').trim() &&
      !!String(rider.bankDetails.bankName || '').trim();
    if (!hasBank) {
      const err = new Error('Please update your bank details first');
      err.statusCode = 400;
      throw err;
    }
    rider.bankDetails.autopayEnabled = false;
    rider.bankDetails.autopay.eligible = false;
    rider.bankDetails.autopay.reason = 'Autopay is disabled';
    rider.bankDetails.autopay.lastEvaluatedAt = new Date();
    await rider.save({ session });

    const wallet = await RiderWallet.findOne({ riderId }).session(session);
    if (!wallet) {
      const err = new Error('Wallet not found');
      err.statusCode = 404;
      throw err;
    }
    if (wallet.balance < amount) {
      const err = new Error('Insufficient balance');
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();

    const withdrawal = new RiderWithdrawal({
      riderId,
      amount,
      bankDetails: {
        accountHolderName: rider.bankDetails.accountHolderName || rider.name,
        accountNumber: rider.bankDetails.accountNumber,
        ifsc: rider.bankDetails.ifsc || rider.bankDetails.ifscCode || '',
        bankName: rider.bankDetails.bankName,
        branch: rider.bankDetails.branch || '',
      },
      isAutopay: false,
      autopayStatus: 'manual_fallback',
      autopayRunAt: null,
      autopayFailureReason: 'Autopay disabled',
      autopayReference: '',
      status: 'pending',
    });
    await withdrawal.save({ session });

    // Reserve funds once (manual+autopay).
    wallet.balance -= amount;
    wallet.lastWithdrawDate = now;
    await wallet.save({ session });

    await session.commitTransaction();
    return { duplicate: false, withdrawal };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
