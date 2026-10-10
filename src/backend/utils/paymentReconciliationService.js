/**
 * Payment Reconciliation Service
 * Handles payment status reconciliation between Cashfree and local database
 * Runs periodic checks to ensure payment consistency
 */

import Order from '../models/Order.js';
import PaymentLog from '../models/PaymentLog.js';
import WalletTransaction from '../models/WalletTransaction.js';
import paymentService from '../services/paymentService.js';
import paymentIdempotencyManager from './paymentIdempotencyManager.js';

class PaymentReconciliationService {
  constructor() {
    this.reconciliationInterval = 60 * 60 * 1000; // 1 hour
    this.maxRetries = 3;
    this.stalePaymentThreshold = 30 * 60 * 1000; // 30 minutes
    this.isRunning = false;
  }

  /**
   * Start reconciliation service
   */
  start() {
    console.log('🔄 [Reconciliation] Starting payment reconciliation service');
    
    // Run immediately on start
    this.reconcilePayments().catch(error => {
      console.error('❌ [Reconciliation] Initial reconciliation failed:', error);
    });

    // Schedule periodic reconciliation
    setInterval(async () => {
      if (!this.isRunning) {
        try {
          await this.reconcilePayments();
        } catch (error) {
          console.error('❌ [Reconciliation] Periodic reconciliation failed:', error);
        }
      } else {
        console.log('⏳ [Reconciliation] Previous reconciliation still running, skipping');
      }
    }, this.reconciliationInterval);
  }

  /**
   * Main reconciliation process
   */
  async reconcilePayments() {
    if (this.isRunning) {
      console.log('⏳ [Reconciliation] Already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔄 [Reconciliation] Starting payment reconciliation');

      // 1. Find stale pending payments
      const stalePayments = await this.findStalePendingPayments();
      console.log(`📊 [Reconciliation] Found ${stalePayments.length} stale pending payments`);

      // 2. Reconcile each stale payment
      for (const payment of stalePayments) {
        try {
          await this.reconcilePayment(payment);
        } catch (error) {
          console.error(`❌ [Reconciliation] Failed to reconcile payment ${payment.orderId}:`, error);
        }
      }

      // 3. Find inconsistent payment statuses
      const inconsistentPayments = await this.findInconsistentPayments();
      console.log(`📊 [Reconciliation] Found ${inconsistentPayments.length} inconsistent payments`);

      // 4. Fix inconsistencies
      for (const payment of inconsistentPayments) {
        try {
          await this.fixInconsistentPayment(payment);
        } catch (error) {
          console.error(`❌ [Reconciliation] Failed to fix inconsistent payment ${payment.orderId}:`, error);
        }
      }

      // 5. Clean up old payment logs
      await this.cleanupOldLogs();

      const duration = Date.now() - startTime;
      console.log(`✅ [Reconciliation] Completed in ${duration}ms`);

    } catch (error) {
      console.error('❌ [Reconciliation] Reconciliation process failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Find stale pending payments
   */
  async findStalePendingPayments() {
    const cutoffTime = new Date(Date.now() - this.stalePaymentThreshold);

    const orders = await Order.find({
      paymentStatus: 'pending',
      createdAt: { $lt: cutoffTime },
      'paymentId': { $exists: true, $ne: null }
    }).populate('userId', 'email name');

    return orders.map(order => ({
      orderId: order._id,
      paymentId: order.paymentId,
      userId: order.userId._id,
      userEmail: order.userId.email,
      amount: order.totalAmount,
      createdAt: order.createdAt,
      staleDuration: Date.now() - order.createdAt.getTime(),
    }));
  }

  /**
   * Find inconsistent payment statuses
   */
  async findInconsistentPayments() {
    const inconsistencies = [];

    // Check orders marked as paid but no payment log
    const paidOrdersWithoutLog = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          paymentId: { $exists: true, $ne: null }
        }
      },
      {
        $lookup: {
          from: 'paymentlogs',
          localField: 'paymentId',
          foreignField: 'paymentId',
          as: 'paymentLogs'
        }
      },
      {
        $match: {
          paymentLogs: { $size: 0 }
        }
      }
    ]);

    inconsistencies.push(...paidOrdersWithoutLog.map(order => ({
      type: 'paid_order_without_log',
      orderId: order._id,
      paymentId: order.paymentId,
      issue: 'Order marked as paid but no payment log found'
    })));

    // Check payment logs with success but order not marked as paid
    const successfulPaymentsWithoutOrderUpdate = await PaymentLog.aggregate([
      {
        $match: {
          status: 'success',
          'metadata.webhookProcessed': true
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'orders'
        }
      },
      {
        $match: {
          'orders.paymentStatus': { $ne: 'paid' }
        }
      }
    ]);

    inconsistencies.push(...successfulPaymentsWithoutOrderUpdate.map(log => ({
      type: 'successful_payment_without_order_update',
      orderId: log.orderId,
      paymentId: log.paymentId,
      issue: 'Payment succeeded but order not updated'
    })));

    return inconsistencies;
  }

  /**
   * Reconcile individual payment
   */
  async reconcilePayment(payment) {
    console.log(`🔍 [Reconciliation] Reconciling payment for order ${payment.orderId}`);

    try {
      // Check payment status with Cashfree
      const cashfreePayment = await paymentService.fetchPayment(payment.paymentId);
      
      if (!cashfreePayment) {
        console.log(`❌ [Reconciliation] Payment ${payment.paymentId} not found in Cashfree`);
        await this.markPaymentAsFailed(payment, 'Payment not found in Cashfree');
        return;
      }

      const cashfreeStatus = cashfreePayment.status;
      console.log(`📊 [Reconciliation] Cashfree status for ${payment.paymentId}: ${cashfreeStatus}`);

      switch (cashfreeStatus) {
        case 'SUCCESS':
        case 'SUCCESSFUL':
        case 'COMPLETED':
          await this.markPaymentAsSuccessful(payment, cashfreePayment);
          break;
        case 'FAILED':
        case 'FAILURE':
          await this.markPaymentAsFailed(payment, 'Payment failed in Cashfree');
          break;
        case 'REFUNDED':
          await this.markPaymentAsRefunded(payment, cashfreePayment);
          break;
        default:
          console.log(`ℹ️ [Reconciliation] Payment ${payment.paymentId} has status: ${cashfreeStatus}`);
      }

    } catch (error) {
      console.error(`❌ [Reconciliation] Error reconciling payment ${payment.paymentId}:`, error);
      
      // If we can't verify with Cashfree, mark as failed after max retries
      const retryCount = await this.getRetryCount(payment.orderId);
      if (retryCount >= this.maxRetries) {
        await this.markPaymentAsFailed(payment, `Failed to verify after ${this.maxRetries} retries`);
      } else {
        await this.incrementRetryCount(payment.orderId);
      }
    }
  }

  /**
   * Fix inconsistent payment
   */
  async fixInconsistentPayment(inconsistency) {
    console.log(`🔧 [Reconciliation] Fixing inconsistency: ${inconsistency.issue}`);

    switch (inconsistency.type) {
      case 'paid_order_without_log':
        await this.createMissingPaymentLog(inconsistency);
        break;
      case 'successful_payment_without_order_update':
        await this.updateOrderPaymentStatus(inconsistency);
        break;
      default:
        console.log(`⚠️ [Reconciliation] Unknown inconsistency type: ${inconsistency.type}`);
    }
  }

  /**
   * Mark payment as successful
   */
  async markPaymentAsSuccessful(payment, cashfreePayment) {
    console.log(`✅ [Reconciliation] Marking payment ${payment.paymentId} as successful`);

    // Update order
    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: 'paid',
      status: 'confirmed',
      paidAt: new Date(),
      'metadata.reconciledAt': new Date().toISOString(),
      'metadata.reconciliationStatus': 'success'
    });

    // Create payment log if missing
    await PaymentLog.create({
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      status: 'success',
      amount: payment.amount,
      metadata: {
        reconciled: true,
        reconciledAt: new Date().toISOString(),
        cashfreeStatus: cashfreePayment.status,
        originalIssue: 'stale_pending_payment'
      }
    });

    // Create wallet transaction if missing
    const existingTransaction = await WalletTransaction.findOne({
      orderId: payment.orderId,
      paymentId: payment.paymentId
    });

    if (!existingTransaction) {
      await WalletTransaction.create({
        userId: payment.userId,
        type: 'payment',
        amount: -payment.amount,
        orderId: payment.orderId,
        paymentId: payment.paymentId,
        status: 'success',
        description: `Payment for order #${payment.orderId}`,
        metadata: {
          reconciled: true,
          reconciledAt: new Date().toISOString(),
        }
      });
    }
  }

  /**
   * Mark payment as failed
   */
  async markPaymentAsFailed(payment, reason) {
    console.log(`❌ [Reconciliation] Marking payment ${payment.paymentId} as failed: ${reason}`);

    // Update order
    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: 'failed',
      status: 'payment_failed',
      failedAt: new Date(),
      'metadata.reconciledAt': new Date().toISOString(),
      'metadata.reconciliationStatus': 'failed',
      'metadata.reconciliationReason': reason
    });

    // Create payment log
    await PaymentLog.create({
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      status: 'failed',
      amount: payment.amount,
      metadata: {
        reconciled: true,
        reconciledAt: new Date().toISOString(),
        failureReason: reason,
        originalIssue: 'stale_pending_payment'
      }
    });
  }

  /**
   * Mark payment as refunded
   */
  async markPaymentAsRefunded(payment, cashfreePayment) {
    console.log(`💸 [Reconciliation] Marking payment ${payment.paymentId} as refunded`);

    // Update order
    await Order.findByIdAndUpdate(payment.orderId, {
      refundStatus: 'processed',
      refundAmount: cashfreePayment.amount,
      refundedAt: new Date(),
      'metadata.reconciledAt': new Date().toISOString(),
      'metadata.reconciliationStatus': 'refunded'
    });

    // Create payment log
    await PaymentLog.create({
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      status: 'refunded',
      amount: cashfreePayment.amount,
      metadata: {
        reconciled: true,
        reconciledAt: new Date().toISOString(),
        refundAmount: cashfreePayment.amount,
        originalIssue: 'stale_pending_payment'
      }
    });
  }

  /**
   * Create missing payment log
   */
  async createMissingPaymentLog(inconsistency) {
    await PaymentLog.create({
      orderId: inconsistency.orderId,
      paymentId: inconsistency.paymentId,
      status: 'success',
      metadata: {
        reconciled: true,
        reconciledAt: new Date().toISOString(),
        originalIssue: 'paid_order_without_log'
      }
    });

    console.log(`✅ [Reconciliation] Created missing payment log for order ${inconsistency.orderId}`);
  }

  /**
   * Update order payment status
   */
  async updateOrderPaymentStatus(inconsistency) {
    await Order.findByIdAndUpdate(inconsistency.orderId, {
      paymentStatus: 'paid',
      status: 'confirmed',
      'metadata.reconciledAt': new Date().toISOString(),
      'metadata.reconciliationStatus': 'fixed'
    });

    console.log(`✅ [Reconciliation] Updated order status for ${inconsistency.orderId}`);
  }

  /**
   * Get retry count for order
   */
  async getRetryCount(orderId) {
    const order = await Order.findById(orderId);
    return order?.metadata?.reconciliationRetryCount || 0;
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(orderId) {
    const currentCount = await this.getRetryCount(orderId);
    await Order.findByIdAndUpdate(orderId, {
      'metadata.reconciliationRetryCount': currentCount + 1,
      'metadata.lastReconciliationAttempt': new Date().toISOString()
    });
  }

  /**
   * Clean up old payment logs
   */
  async cleanupOldLogs() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const result = await PaymentLog.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['initiated', 'processing'] }
    });

    if (result.deletedCount > 0) {
      console.log(`🧹 [Reconciliation] Cleaned up ${result.deletedCount} old payment logs`);
    }
  }

  /**
   * Get reconciliation statistics
   */
  async getStats() {
    const stats = {
      isRunning: this.isRunning,
      stalePayments: (await this.findStalePendingPayments()).length,
      inconsistentPayments: (await this.findInconsistentPayments()).length,
      lastRun: null,
    };

    // Get last run time from metadata
    const lastRunLog = await PaymentLog.findOne({
      'metadata.reconciliationCompleted': true
    }).sort({ 'metadata.reconciledAt': -1 });

    if (lastRunLog) {
      stats.lastRun = lastRunLog.metadata.reconciledAt;
    }

    return stats;
  }

  /**
   * Manual reconciliation trigger
   */
  async manualReconciliation(orderId = null) {
    console.log(`🔄 [Reconciliation] Manual reconciliation triggered${orderId ? ` for order ${orderId}` : ''}`);

    if (orderId) {
      // Reconcile specific order
      const order = await Order.findById(orderId);
      if (order && order.paymentStatus === 'pending') {
        const payment = {
          orderId: order._id,
          paymentId: order.paymentId,
          userId: order.userId,
          amount: order.totalAmount,
          createdAt: order.createdAt,
        };
        await this.reconcilePayment(payment);
      }
    } else {
      // Full reconciliation
      await this.reconcilePayments();
    }
  }
}

// Singleton instance
const paymentReconciliationService = new PaymentReconciliationService();

export default paymentReconciliationService;
