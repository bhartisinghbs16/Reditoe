/**
 * Rider Bank Account Controller
 * Handles rider bank account management and withdrawal requests
 */

import RiderBankAccount from '../models/RiderBankAccount.js';
import User from '../models/User.js';
import RiderWithdrawal from '../models/RiderWithdrawal.js';
import RiderWallet from '../models/RiderWallet.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';
import crypto from 'crypto';

/**
 * Add or update bank account - POST /api/rider/bank-account
 */
export const addBankAccount = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const {
      accountHolderName,
      accountNumber,
      confirmAccountNumber,
      ifscCode,
      bankName,
      branchName,
      accountType,
      panNumber,
      aadhaarNumber,
      upiId,
      payoutMethod,
      settlementCycle,
      settlementDay,
      autoSettlement,
    } = req.body;

    // Validate required fields
    if (!accountHolderName || !accountNumber || !confirmAccountNumber || !ifscCode || !bankName || !branchName || !accountType) {
      return res.status(400).json({
        status: 'error',
        message: 'All required fields must be provided',
      });
    }

    // Validate account number match
    if (accountNumber !== confirmAccountNumber) {
      return res.status(400).json({
        status: 'error',
        message: 'Account numbers do not match',
      });
    }

    // Validate IFSC code format
    if (!/^[A-Z]{4}0[A-Z0-9]{7}$/.test(ifscCode)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid IFSC code format',
      });
    }

    // Validate account number format (basic validation)
    if (!/^\d+$/.test(accountNumber)) {
      return res.status(400).json({
        status: 'error',
        message: 'Account number must contain only digits',
      });
    }

    // Check if rider already has a bank account
    const existingAccount = await RiderBankAccount.findOne({ riderId });
    if (existingAccount) {
      return res.status(409).json({
        status: 'error',
        message: 'Bank account already exists',
        data: {
          accountNumber: existingAccount.accountNumber,
          bankName: existingAccount.bankName,
          verificationStatus: existingAccount.verificationStatus,
        },
      });
    }

    // Create new bank account
    const bankAccount = new RiderBankAccount({
      riderId,
      accountHolderName,
      accountNumber,
      confirmAccountNumber,
      ifscCode,
      bankName,
      branchName,
      accountType,
      panNumber,
      aadhaarNumber,
      upiId,
      payoutMethod,
      settlementCycle,
      settlementDay,
      autoSettlement,
      addedBy: riderId,
    });

    await bankAccount.save();

    // Update rider status
    await User.findByIdAndUpdate(riderId, {
      bankDetails: {
        accountHolderName,
        accountNumber: accountNumber.slice(-4), // Show only last 4 digits for security
        ifscCode,
        bankName,
        branchName,
      },
      hasBankAccount: true,
    });    res.status(201).json({
      status: 'success',
      message: 'Bank account added successfully',
      data: {
        bankAccount: {
          id: bankAccount._id,
          accountHolderName,
          bankName,
          branchName,
          accountType,
          ifscCode,
          verificationStatus: 'pending',
          payoutMethod,
          settlementCycle,
          autoSettlement,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add bank account',
    });
  }
};

/**
 * Get rider bank account - GET /api/rider/bank-account
 */
export const getBankAccount = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const bankAccount = await RiderBankAccount.findOne({ riderId, status: 'active' });
    if (!bankAccount) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        bankAccount: {
          id: bankAccount._id,
          accountHolderName: bankAccount.accountHolderName,
          bankName: bankAccount.bankName,
          branchName: bankAccount.branchName,
          accountType: bankAccount.accountType,
          ifscCode: bankAccount.ifscCode,
          verificationStatus: bankAccount.verificationStatus,
          isVerified: bankAccount.isVerified,
          payoutMethod: bankAccount.payoutMethod,
          withdrawalLimit: bankAccount.withdrawalLimit,
          settlementCycle: bankAccount.settlementCycle,
          settlementDay: bankAccount.settlementDay,
          autoSettlement: bankAccount.autoSettlement,
          upiId: bankAccount.upiId,
          createdAt: bankAccount.createdAt,
        },
        withdrawalStats: bankAccount.getWithdrawalStats(),
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get bank account',
    });
  }
};

/**
 * Update bank account - PUT /api/rider/bank-account
 */
export const updateBankAccount = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const bankAccount = await RiderBankAccount.findOne({ riderId, status: 'active' });
    if (!bankAccount) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found',
      });
    }

    const {
      accountHolderName,
      ifscCode,
      bankName,
      branchName,
      accountType,
      panNumber,
      aadhaarNumber,
      upiId,
      payoutMethod,
      settlementCycle,
      settlementDay,
      autoSettlement,
    } = req.body;

    // Update allowed fields
    if (accountHolderName) bankAccount.accountHolderName = accountHolderName;
    if (ifscCode) {
      if (!/^[A-Z]{4}0[A-Z0-9]{7}$/.test(ifscCode)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid IFSC code format',
        });
      }
      bankAccount.ifscCode = ifscCode;
    }
    if (bankName) bankAccount.bankName = bankName;
    if (branchName) bankAccount.branchName = branchName;
    if (accountType) bankAccount.accountType = accountType;
    if (panNumber) bankAccount.panNumber = panNumber.toUpperCase();
    if (aadhaarNumber) bankAccount.aadhaarNumber = aadhaarNumber;
    if (upiId) bankAccount.upiId = upiId;
    if (payoutMethod) bankAccount.payoutMethod = payoutMethod;
    if (settlementCycle) bankAccount.settlementCycle = settlementCycle;
    if (settlementDay) bankAccount.settlementDay = settlementDay;
    if (autoSettlement !== undefined) bankAccount.autoSettlement = autoSettlement;

    // Reset verification status if bank details changed
    const hasBankDetailsChanged = 
      bankAccount.isModified('ifscCode') || 
      bankAccount.isModified('accountNumber') ||
      bankAccount.isModified('bankName') ||
      bankAccount.isModified('branchName');
    
    if (hasBankDetailsChanged) {
      bankAccount.isVerified = false;
      bankAccount.verificationStatus = 'pending';
      bankAccount.verificationAttempts = 0;
      bankAccount.verifiedAt = null;
      bankAccount.verifiedBy = null;
      bankAccount.rejectionReason = '';
    }

    await bankAccount.save();

    // Update user bank details
    await User.findByIdAndUpdate(riderId, {
      bankDetails: {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber: bankAccount.accountNumber.slice(-4),
        ifscCode: bankAccount.ifscCode,
        bankName: bankAccount.bankName,
        branchName: bankAccount.branchName,
      },
    });    res.status(200).json({
      status: 'success',
      message: 'Bank account updated successfully',
      data: {
        bankAccount: {
          id: bankAccount._id,
          accountHolderName: bankAccount.accountHolderName,
          bankName: bankAccount.bankName,
          verificationStatus: bankAccount.verificationStatus,
          isVerified: bankAccount.isVerified,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update bank account',
    });
  }
};

/**
 * Delete bank account - DELETE /api/rider/bank-account
 */
export const deleteBankAccount = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const bankAccount = await RiderBankAccount.findOne({ riderId });
    if (!bankAccount) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found',
      });
    }

    // Check for pending withdrawals
    const pendingWithdrawals = await RiderWithdrawal.find({
      riderId,
      status: 'pending',
    });

    if (pendingWithdrawals.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete bank account with pending withdrawals',
        data: {
          pendingWithdrawals: pendingWithdrawals.length,
        },
      });
    }

    // Delete bank account
    await RiderBankAccount.findByIdAndDelete(bankAccount._id);

    // Update user status
    await User.findByIdAndUpdate(riderId, {
      bankDetails: {},
      hasBankAccount: false,
    });    res.status(200).json({
      status: 'success',
      message: 'Bank account deleted successfully',
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete bank account',
    });
  }
};

/**
 * Request withdrawal - POST /api/rider/withdrawal
 */
export const requestWithdrawal = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const { amount, withdrawalType, notes } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid withdrawal amount is required',
      });
    }

    // Get rider bank account
    const bankAccount = await RiderBankAccount.findOne({ riderId, status: 'active', isVerified: true });
    if (!bankAccount) {
      return res.status(400).json({
        status: 'error',
        message: 'No verified bank account found',
      });
    }

    // Check withdrawal limits
    if (!bankAccount.canWithdraw(amount)) {
      const stats = bankAccount.getWithdrawalStats();
      return res.status(400).json({
        status: 'error',
        message: 'Withdrawal limit exceeded',
        data: stats,
      });
    }

    // Get rider wallet
    const riderWallet = await RiderWallet.findOne({ riderId });
    if (!riderWallet || riderWallet.balance < amount) {
      return res.status(400).json({
        status: 'error',
        message: 'Insufficient wallet balance',
      });
    }

    // Create withdrawal request
    const withdrawalId = `WD${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    const withdrawal = new RiderWithdrawal({
      riderId,
      withdrawalId,
      amount,
      withdrawalType: withdrawalType || 'bank_transfer',
      bankAccountId: bankAccount._id,
      notes: notes || '',
      status: 'pending',
      requestedAt: new Date(),
    });

    await withdrawal.save();

    // Deduct from wallet
    riderWallet.balance -= amount;
    await riderWallet.save();

    // Update withdrawal stats
    await bankAccount.updateWithdrawalStats(amount);    res.status(201).json({
      status: 'success',
      message: 'Withdrawal request submitted successfully',
      data: {
        withdrawalId,
        amount,
        withdrawalType,
        status: 'pending',
        bankName: bankAccount.bankName,
        ifscCode: bankAccount.ifscCode,
        requestedAt: withdrawal.requestedAt,
        estimatedProcessingTime: '24-48 hours',
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to request withdrawal',
    });
  }
};

/**
 * Get withdrawal history - GET /api/rider/withdrawals
 */
export const getWithdrawalHistory = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    
    const query = { riderId };
    if (status) query.status = status;
    if (startDate) query.requestedAt = { $gte: new Date(startDate) };
    if (endDate) query.requestedAt = { $lte: new Date(endDate) };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const withdrawals = await RiderWithdrawal.find(query)
      .populate('bankAccountId', 'bankName ifscCode branchName')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await RiderWithdrawal.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get withdrawal history',
    });
  }
};

/**
 * Get withdrawal details - GET /api/rider/withdrawal/:id
 */
export const getWithdrawalDetails = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    const { id } = req.params;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    const withdrawal = await RiderWithdrawal.findOne({
      _id: id,
      riderId,
    }).populate('bankAccountId', 'bankName ifscCode branchName');

    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: withdrawal,
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get withdrawal details',
    });
  }
};

/**
 * Cancel withdrawal - POST /api/rider/withdrawal/:id/cancel
 */
export const cancelWithdrawal = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    const withdrawal = await RiderWithdrawal.findOne({
      _id: id,
      riderId,
      status: { $in: ['pending', 'processing'] },
    });

    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal not found or cannot be cancelled',
      });
    }

    // Cancel withdrawal
    withdrawal.status = 'cancelled';
    withdrawal.cancelledAt = new Date();
    withdrawal.cancellationReason = reason || 'Cancelled by rider';
    
    await withdrawal.save();

    // Refund amount back to wallet
    const riderWallet = await RiderWallet.findOne({ riderId });
    if (riderWallet) {
      riderWallet.balance += withdrawal.amount;
      await riderWallet.save();
    }    res.status(200).json({
      status: 'success',
      message: 'Withdrawal cancelled successfully',
      data: {
        withdrawalId: withdrawal.withdrawalId,
        amount: withdrawal.amount,
        cancelledAt: withdrawal.cancelledAt,
        cancellationReason: withdrawal.cancellationReason,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to cancel withdrawal',
    });
  }
};

/**
 * Get withdrawal statistics - GET /api/rider/withdrawal-stats
 */
export const getWithdrawalStats = async (req, res) => {
  try {
    const riderId = req.user?.id || req.user?._id;
    
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    const bankAccount = await RiderBankAccount.findOne({ riderId, status: 'active' });
    if (!bankAccount) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found',
      });
    }

    const stats = bankAccount.getWithdrawalStats();
    const riderWallet = await RiderWallet.findOne({ riderId });

    res.status(200).json({
      status: 'success',
      data: {
        withdrawalStats: stats,
        walletBalance: riderWallet?.balance || 0,
        bankAccount: {
          bankName: bankAccount.bankName,
          ifscCode: bankAccount.ifscCode,
          branchName: bankAccount.branchName,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get withdrawal stats',
    });
  }
};

export default {
  addBankAccount,
  getBankAccount,
  updateBankAccount,
  deleteBankAccount,
  requestWithdrawal,
  getWithdrawalHistory,
  getWithdrawalDetails,
  cancelWithdrawal,
  getWithdrawalStats,
};
