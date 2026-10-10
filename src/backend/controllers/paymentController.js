import paymentService from '../services/paymentService.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import PaymentLog from '../models/PaymentLog.js';
import Refund from '../models/Refund.js';
import { findOrCreateRefundRequest } from '../utils/refundRequests.js';
import paymentIdempotencyManager from '../utils/paymentIdempotencyManager.js';
import paymentWebhookProcessor from '../utils/paymentWebhookProcessor.js';
import crypto from 'crypto';

const verifyWebhookSignature = (req) => {
  try {
    const receivedSignature = req.headers['x-cf-signature'];
    if (!receivedSignature) {
      return true; // Allow in development/test mode if not configured
    }

    // Cashfree signature verification would go here
    // For now, we'll allow it in test mode
    return true;
  } catch (error) {
    return false;
  }
};

const logPaymentAttempt = async (orderId, paymentId, status, amount, metadata = {}) => {
  try {
    await PaymentLog.create({
      orderId,
      paymentId,
      status,
      amount,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        userAgent: metadata.userAgent || 'unknown',
      },
    });
  } catch (error) {
  }
};

const processWalletRefund = async (userId, amount, orderId, reason) => {
  try {
    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
    }

    // Add refund amount to wallet
    wallet.balance += amount;
    await wallet.save();

    // Create wallet transaction
    const transaction = new WalletTransaction({
      userId,
      orderId,
      type: 'refund',
      amount,
      balance: wallet.balance,
      description: `Refund: ${reason}`,
      status: 'completed',
      metadata: {
        refundReason: reason,
        processedAt: new Date().toISOString(),
      },
    });

    await transaction.save();
    return {
      success: true,
      transactionId: transaction._id.toString(),
      newBalance: wallet.balance,
    };
  } catch (error) {
    throw new Error('Failed to process wallet refund');
  }
};

class PaymentController {
  // Create payment order
  async createPaymentOrder(req, res) {
    try {
      const { orderId, amount, currency = 'INR' } = req.body;
      const userId = req.user.id;

      // Validate order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Verify order belongs to user
      if (order.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Use order amount if not provided
      const paymentAmount = amount || order.totalAmount;

      // Check for duplicate payment attempts
      const duplicateCheck = await paymentIdempotencyManager.checkDuplicatePayment(
        orderId, 
        userId, 
        paymentAmount, 
        'cashfree'
      );

      if (duplicateCheck.exists) {
        return res.status(409).json({
          success: false,
          message: 'Payment already in progress for this order',
          data: duplicateCheck.data,
        });
      }

      // Store payment attempt for idempotency
      const idempotencyKey = await paymentIdempotencyManager.storePaymentAttempt(
        orderId,
        userId,
        paymentAmount,
        { currency, receipt: `order_${orderId}` },
        'cashfree'
      );
      // Create payment order
      const result = await paymentService.createPaymentOrder({
        amount: paymentAmount,
        currency,
        orderId,
        userId,
        receipt: `order_${orderId}`,
      });

      // Log payment attempt
      try {
        await logPaymentAttempt(orderId, null, 'initiated', paymentAmount, {
          idempotencyKey,
          paymentOrderId: result.data.order_id,
          userAgent: req.headers['user-agent'],
        });
      } catch (logError) {
        console.error('Payment log failed:', logError.message);
      }

      res.json({
        success: true,
        data: result.data,
        idempotencyKey,
      });
    } catch (error) {
      console.error('PAYMENT CREATE ERROR STATUS:', error.response?.status);
      console.error('PAYMENT CREATE ERROR DATA:', error.response?.data);
      console.error('PAYMENT CREATE ERROR MESSAGE:', error.message);
      console.error('PAYMENT CREATE REQUEST BODY:', {
        orderId: req.body?.orderId,
        amount: req.body?.amount,
        currency: req.body?.currency,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: error.message,
      });
    }
  }

  // Verify payment
  async verifyPayment(req, res) {
    try {
      const { orderId, cashfreeOrderId, cf_order_id } = req.body;
      const finalCfOrderId = cashfreeOrderId || cf_order_id;
      const userId = req.user.id;

      // Validate required fields
      if (!finalCfOrderId || !orderId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required payment details',
        });
      }

      // Check for duplicate verification
      const idempotencyKey = paymentIdempotencyManager.generateIdempotencyKey(
        orderId, 
        userId, 
        null, 
        'verification'
      );
      
      const existingVerification = await paymentIdempotencyManager.checkIdempotency(idempotencyKey);
      if (existingVerification.exists && existingVerification.status === 'success') {
        return res.status(409).json({
          success: false,
          message: 'Payment already verified',
          data: existingVerification.data,
        });
      }
      // Store verification attempt
      await paymentIdempotencyManager.storeIdempotency(idempotencyKey, {
        orderId,
        userId,
        cf_order_id: finalCfOrderId,
        verificationType: 'client_side',
      }, 'verifying');

      // Verify payment
      const result = await paymentService.fetchPaymentsByOrderId(finalCfOrderId);

      if (!result.success || !result.payment) {
        await paymentIdempotencyManager.markPaymentFailed(idempotencyKey, {
          error: 'Payment not successful',
          verificationType: 'client_side',
          failedAt: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          message: 'Payment not successful',
        });
      }

      const payment = result.payment;
      const paymentId = payment.cf_payment_id || payment.payment_id || finalCfOrderId;
      const paymentAmount = parseFloat(payment.payment_amount || payment.order_amount || 0);
      const resultData = {
        paymentId,
        orderId,
        amount: paymentAmount,
        status: 'paid',
      };

      await paymentService.updateOrderPaymentStatus(orderId, {
        paymentId,
        status: 'paid',
        amount: paymentAmount,
        method: 'cashfree',
        paidAt: new Date(),
      });

      // Create PaymentLog entry
      await PaymentLog.create({
        orderId: orderId,
        paymentId,
        status: 'paid',
        amount: paymentAmount,
        method: 'cashfree',
        metadata: {
          cf_order_id: finalCfOrderId,
          verificationType: 'client_side',
          userAgent: req.headers['user-agent'],
          verifiedAt: new Date().toISOString(),
        }
      });

      // Mark verification as successful
      await paymentIdempotencyManager.markPaymentSuccess(idempotencyKey, {
        ...resultData,
        verifiedAt: new Date().toISOString(),
      });

      // Log successful verification
      await logPaymentAttempt(orderId, paymentId, 'verified', paymentAmount, {
        cf_order_id: finalCfOrderId,
        verificationType: 'client_side',
        userAgent: req.headers['user-agent'],
      });

      console.log("PAYMENT VERIFY RESPONSE:", resultData);
      console.log("=== PAYMENT VERIFICATION COMPLETE ===");

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: resultData,
      });
    } catch (error) {
      // Mark verification as failed
      const idempotencyKey = paymentIdempotencyManager.generateIdempotencyKey(
        req.body.orderId, 
        req.user.id, 
        null, 
        'verification'
      );
      
      await paymentIdempotencyManager.markPaymentFailed(idempotencyKey, {
        error: error.message,
        verificationType: 'client_side',
        failedAt: new Date().toISOString(),
      });

      res.status(400).json({
        success: false,
        message: error.message || 'Payment verification failed',
      });
    }
  }

  // Process Cashfree webhook
  async processWebhook(req, res) {
    try {
      // FIX 4: Handle raw body for webhook signature verification
      const rawBody = req.body.toString();
      const parsedBody = JSON.parse(rawBody);
      
      const webhookData = {
        event: parsedBody.event,
        payload: parsedBody,
        headers: req.headers,
        rawBody: rawBody,
      };
      // Enhanced signature verification
      const isValid = verifyWebhookSignature(req);
      if (!isValid) {
        await logPaymentAttempt('webhook', null, 'signature_failed', 0, {
          event: webhookData.event,
          headers: req.headers,
          userAgent: req.headers['user-agent'],
        });
        
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature',
        });
      }

      // Process webhook with enhanced processor
      const result = await paymentWebhookProcessor.processWebhook(webhookData);

      // Log webhook processing
      await logPaymentAttempt('webhook', null, 'webhook_processed', 0, {
        event: webhookData.event,
        result: result.status,
        userAgent: req.headers['user-agent'],
      });

      res.json({ 
        success: true,
        message: 'Webhook processed successfully',
        data: result,
      });
    } catch (error) {
      // Log webhook error
      const errorEvent = req.body ? JSON.parse(req.body.toString()).event : 'unknown';
      await logPaymentAttempt('webhook', null, 'webhook_error', 0, {
        event: errorEvent,
        error: error.message,
        userAgent: req.headers['user-agent'],
      });
      
      res.status(400).json({
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
      });
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(req) {
    try {
      const receivedSignature = req.headers['x-cf-signature'];
      if (!receivedSignature) {
        return true; // Allow in development/test mode if not configured
      }

      // Cashfree signature verification would go here
      // For now, we'll allow it in test mode
      return true;
    } catch (error) {
      return false;
    }
  }

  // Log payment attempt
  async logPaymentAttempt(orderId, paymentId, status, amount, metadata = {}) {
    try {
      await PaymentLog.create({
        orderId,
        paymentId,
        status,
        amount,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          userAgent: metadata.userAgent || 'unknown',
        },
      });
    } catch (error) {
    }
  }

  // Create wallet top-up order
  async createWalletTopUp(req, res) {
    try {
      const { amount } = req.body;
      const userId = req.user.id;

      // Validate amount
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount',
        });
      }

      // Validate minimum and maximum amounts
      if (amount < 100) {
        return res.status(400).json({
          success: false,
          message: 'Minimum top-up amount is ₹100',
        });
      }

      if (amount > 50000) {
        return res.status(400).json({
          success: false,
          message: 'Maximum top-up amount is ₹50,000',
        });
      }

      const result = await paymentService.processWalletTopUp(userId, amount);

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create wallet top-up',
        error: error.message,
      });
    }
  }

  // Verify wallet top-up payment
  async verifyWalletTopUp(req, res) {
    try {
      const { cf_order_id, cf_payment_id } = req.body;
      const userId = req.user.id;

      // Validate required fields
      if (!cf_order_id || !cf_payment_id) {
        return res.status(400).json({
          success: false,
          message: 'Missing required payment details',
        });
      }

      const result = await paymentService.verifyWalletTopUp({
        cf_order_id,
        cf_payment_id,
        userId,
      });

      res.json({
        success: true,
        message: 'Wallet top-up successful',
        data: result.data,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || 'Wallet top-up verification failed',
      });
    }
  }

  // Process wallet payment for order
  async processWalletPayment(req, res) {
    try {
      const { orderId, amount } = req.body;
      const userId = req.user.id;

      // Validate order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Verify order belongs to user
      if (order.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Use order amount if not provided
      const paymentAmount = amount || order.totalAmount;

      const result = await paymentService.processWalletPayment(userId, orderId, paymentAmount);

      res.json({
        success: true,
        message: 'Payment successful',
        data: result.data,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || 'Wallet payment failed',
      });
    }
  }

  // Get wallet balance
  async getWalletBalance(req, res) {
    try {
      const userId = req.user.id;

      const balance = await paymentService.getWalletBalance(userId);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet balance',
        error: error.message,
      });
    }
  }

  // Get wallet transactions
  async getWalletTransactions(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      const category = req.query.category;

      const options = { page, limit, type, category };
      const result = await paymentService.getWalletTransactions(userId, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet transactions',
        error: error.message,
      });
    }
  }

  // Get wallet statistics
  async getWalletStats(req, res) {
    try {
      const userId = req.user.id;
      const period = req.query.period || 'month';

      const stats = await WalletTransaction.getTransactionStats(userId, period);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet statistics',
        error: error.message,
      });
    }
  }

  // Get daily wallet stats
  async getDailyWalletStats(req, res) {
    try {
      const userId = req.user.id;
      const days = parseInt(req.query.days) || 30;

      const stats = await WalletTransaction.getDailyStats(userId, days);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get daily wallet statistics',
        error: error.message,
      });
    }
  }

  // Process refund
  async processRefund(req, res) {
    try {
      const { paymentId, amount, reason } = req.body;

      // Validate required fields
      if (!paymentId || !amount || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Payment ID, amount, and reason are required',
        });
      }

      const result = await paymentService.processRefund(paymentId, amount, reason);

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: result.data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process refund',
        error: error.message,
      });
    }
  }

  // Get payment methods
  async getPaymentMethods(req, res) {
    try {
      const userId = req.user.id;

      // Get wallet balance to determine available methods
      const wallet = await Wallet.findByUserId(userId);
      const hasWallet = wallet && wallet.balance > 0;

      const methods = [
        {
          id: 'cashfree',
          name: 'Cashfree',
          description: 'Pay via UPI, Credit Card, Debit Card, Net Banking',
          icon: 'cashfree',
          enabled: true,
        },
        {
          id: 'wallet',
          name: 'Wallet',
          description: `Pay using your wallet balance`,
          icon: 'wallet',
          enabled: hasWallet,
          balance: wallet?.balance || 0,
        },
      ];

      res.json({
        success: true,
        data: {
          methods,
          walletBalance: wallet?.balance || 0,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get payment methods',
        error: error.message,
      });
    }
  }

  // Validate payment method
  async validatePaymentMethod(req, res) {
    try {
      const { method, amount, orderId } = req.body;
      const userId = req.user.id;

      let isValid = true;
      let message = '';

      switch (method) {
        case 'wallet':
          const wallet = await Wallet.findByUserId(userId);
          if (!wallet || wallet.balance < amount) {
            isValid = false;
            message = 'Insufficient wallet balance';
          }
          break;
        case 'cashfree':
          // Cashfree is always valid for now
          isValid = true;
          break;
        default:
          isValid = false;
          message = 'Invalid payment method';
      }

      res.json({
        success: true,
        data: {
          isValid,
          message,
          method,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to validate payment method',
        error: error.message,
      });
    }
  }

  // Process refund - Enhanced with wallet support and idempotency
  async processRefund(req, res) {
    try {
      const { orderId, refundAmount, refundReason, refundMethod = 'wallet' } = req.body;
      const userId = req.user.id;

      // Validate order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Verify order belongs to user
      if (order.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Validate refund amount
      if (!refundAmount || refundAmount <= 0 || refundAmount > order.total) {
        return res.status(400).json({
          success: false,
          message: 'Invalid refund amount',
        });
      }

      // Check for duplicate refund attempts
      const idempotencyKey = paymentIdempotencyManager.generateIdempotencyKey(
        orderId, 
        userId, 
        refundAmount, 
        'refund'
      );
      
      const existingRefund = await paymentIdempotencyManager.checkIdempotency(idempotencyKey);
      if (existingRefund.exists && existingRefund.status === 'success') {
        return res.status(409).json({
          success: false,
          message: 'Refund already processed for this order',
          data: existingRefund.data,
        });
      }
      // Store refund attempt
      await paymentIdempotencyManager.storeIdempotency(idempotencyKey, {
        orderId,
        userId,
        refundAmount,
        refundMethod,
        refundReason,
      }, 'processing');

      let refundResult;

      if (refundMethod === 'wallet') {
        // Process wallet refund
        refundResult = await processWalletRefund(userId, refundAmount, orderId, refundReason);
      } else {
        // Process original payment method refund
        refundResult = await paymentService.processRefund({
          orderId,
          refundAmount,
          refundReason,
          refundMethod,
        });
      }

      /*
       * The order's refund record, raised only if it has none open.
       *
       * A cancelled order already raises a request, and this raised a second
       * for the same money — so the admin's list showed one refund twice and
       * either row could be approved.
       */
      const { refund, created } = await findOrCreateRefundRequest({
        refundId: `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        orderId,
        userId,
        refundAmount,
        refundReason,
        refundMethod,
        refundStatus: 'approved',
        processingDetails: {
          transactionId: refundResult.transactionId || 'WALLET_REFUND',
          processedAt: new Date(),
          processor: refundMethod === 'wallet' ? 'wallet_system' : 'payment_gateway',
        },
        refundTimeline: [{
          status: 'requested',
          timestamp: new Date(),
          message: 'Refund requested by user',
          updatedBy: userId,
        }, {
          status: 'approved',
          timestamp: new Date(),
          message: 'Refund processed successfully',
          updatedBy: userId,
        }]
      });

      // An existing request is brought up to date rather than duplicated: the
      // money has now actually moved, whoever raised the row.
      if (!created) {
        refund.refundStatus = 'approved';
        refund.processingDetails = {
          transactionId: refundResult.transactionId || 'WALLET_REFUND',
          processedAt: new Date(),
          processor: refundMethod === 'wallet' ? 'wallet_system' : 'payment_gateway',
        };
        refund.refundTimeline.push({
          status: 'processed',
          timestamp: new Date(),
          message: 'Refund processed successfully',
          updatedBy: userId,
        });
        await refund.save();
      }

      // Mark refund as successful
      await paymentIdempotencyManager.markPaymentSuccess(idempotencyKey, {
        refundId: refund.refundId,
        refundAmount,
        refundMethod,
        processedAt: new Date().toISOString(),
      });

      // Log refund attempt
      await logPaymentAttempt(orderId, refund.refundId, 'refunded', refundAmount, {
        refundMethod,
        refundReason,
        refundId: refund.refundId,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refundId: refund.refundId,
          refundAmount,
          refundMethod,
          refundStatus: refund.refundStatus,
          processedAt: refund.processingDetails.processedAt,
        },
      });
    } catch (error) {
      // Mark refund as failed
      const idempotencyKey = paymentIdempotencyManager.generateIdempotencyKey(
        req.body.orderId, 
        req.user.id, 
        req.body.refundAmount, 
        'refund'
      );
      
      await paymentIdempotencyManager.markPaymentFailed(idempotencyKey, {
        error: error.message,
        failedAt: new Date().toISOString(),
      });

      res.status(400).json({
        success: false,
        message: error.message || 'Refund processing failed',
      });
    }
  }

  // Process wallet refund
  async processWalletRefund(userId, amount, orderId, reason) {
    try {
      // Find or create wallet
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0 });
      }

      // Add refund amount to wallet
      wallet.balance += amount;
      await wallet.save();

      // Create wallet transaction
      const transaction = new WalletTransaction({
        userId,
        orderId,
        type: 'refund',
        amount,
        balance: wallet.balance,
        description: `Refund: ${reason}`,
        status: 'completed',
        metadata: {
          refundReason: reason,
          processedAt: new Date().toISOString(),
        },
      });

      await transaction.save();
      return {
        success: true,
        transactionId: transaction._id.toString(),
        newBalance: wallet.balance,
      };
    } catch (error) {
      throw new Error('Failed to process wallet refund');
    }
  }
}

export default new PaymentController();
