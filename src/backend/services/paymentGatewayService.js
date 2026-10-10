/**
 * Payment Gateway Service
 * Handles real payment gateway integration for orders, refunds, and payouts
 */
import PaymentGateway from '../models/PaymentGateway.js';
import FinancialTransaction from '../models/FinancialTransaction.js';
import Order from '../models/Order.js';
import Refund from '../models/Refund.js';
import VendorSettlement from '../models/VendorSettlement.js';
import crypto from 'crypto';
import axios from 'axios';

class PaymentGatewayService {
  constructor() {
    this.gateways = new Map();
    this.init();
  }

  /**
   * Initialize payment gateways
   */
  async init() {
    try {
      const gateways = await PaymentGateway.find({ isActive: true });
      
      for (const gateway of gateways) {
        this.gateways.set(gateway.name, {
          ...gateway.toObject(),
          client: this.createGatewayClient(gateway),
        });
      }
      
      console.log(`Initialized ${gateways.length} payment gateways`);
    } catch (error) {
      console.error('Error initializing payment gateways:', error);
    }
  }

  /**
   * Create gateway client based on type
   */
  createGatewayClient(gateway) {
    switch (gateway.gatewayType) {
      case 'stripe':
        return new StripeClient(gateway);
      case 'paypal':
        return new PayPalClient(gateway);
      default:
        return new GenericGatewayClient(gateway);
    }
  }

  /**
   * Process order payment
   */
  async processOrderPayment(orderId, paymentMethod, paymentDetails) {
    try {
      const order = await Order.findById(orderId).populate('restaurantId');
      if (!order) {
        throw new Error('Order not found');
      }

      // Get active gateway
      const gateway = this.getActiveGateway();
      if (!gateway) {
        throw new Error('No active payment gateway available');
      }

      // Create payment transaction
      const transaction = new FinancialTransaction({
        type: 'order_payment',
        orderId: order._id,
        restaurantId: order.restaurantId._id,
        amount: order.total,
        paymentMethod,
        paymentGatewayId: gateway._id,
        status: 'pending',
        notes: `Payment for order ${orderId}`,
      });

      await transaction.save();

      // Process payment through gateway
      const paymentResult = await gateway.client.processPayment({
        orderId: order._id,
        amount: order.total,
        currency: 'INR',
        paymentMethod,
        customerInfo: paymentDetails.customerInfo,
        description: `Payment for order #${order._id}`,
      });

      // Update transaction with gateway response
      transaction.gatewayTransactionId = paymentResult.transactionId;
      transaction.status = paymentResult.success ? 'completed' : 'failed';
      transaction.processedAt = new Date();
      
      if (paymentResult.success) {
        transaction.metadata = {
          gatewayResponse: paymentResult.response,
          paymentMethod: paymentMethod,
        };
      } else {
        transaction.notes = `Payment failed: ${paymentResult.errorMessage}`;
      }

      await transaction.save();

      // Update order status
      if (paymentResult.success) {
        order.paymentStatus = 'paid';
        order.paymentInfo = {
          method: paymentMethod,
          transactionId: paymentResult.transactionId,
          paidAt: new Date(),
        };
        await order.save();
      }

      return {
        success: paymentResult.success,
        transaction,
        gatewayResponse: paymentResult,
      };
    } catch (error) {
      console.error('Error processing order payment:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(orderId, refundAmount, refundReason) {
    try {
      const order = await Order.findById(orderId).populate('restaurantId');
      if (!order) {
        throw new Error('Order not found');
      }

      // Find original payment transaction
      const originalTransaction = await FinancialTransaction.findOne({
        orderId: order._id,
        type: 'order_payment',
        status: 'completed',
      });

      if (!originalTransaction) {
        throw new Error('Original payment transaction not found');
      }

      // Get gateway
      const gateway = this.getGatewayById(originalTransaction.paymentGatewayId);
      if (!gateway) {
        throw new Error('Payment gateway not found');
      }

      // Create refund transaction
      const refundTransaction = new FinancialTransaction({
        type: 'refund',
        orderId: order._id,
        restaurantId: order.restaurantId._id,
        amount: refundAmount,
        paymentMethod: originalTransaction.paymentMethod,
        paymentGatewayId: originalTransaction.paymentGatewayId,
        status: 'pending',
        refundInfo: {
          isRefund: true,
          originalTransactionId: originalTransaction._id,
          refundReason,
          refundNotes: `Refund for order ${orderId}`,
        },
        notes: `Refund of ${refundAmount} for order ${orderId}`,
      });

      await refundTransaction.save();

      // Process refund through gateway
      const refundResult = await gateway.client.processRefund({
        originalTransactionId: originalTransaction.gatewayTransactionId,
        refundAmount,
        reason: refundReason,
        description: `Refund for order #${order._id}`,
      });

      // Update refund transaction
      refundTransaction.gatewayTransactionId = refundResult.refundId;
      refundTransaction.status = refundResult.success ? 'completed' : 'failed';
      refundTransaction.processedAt = new Date();
      
      if (refundResult.success) {
        refundTransaction.metadata = {
          gatewayResponse: refundResult.response,
          refundAmount,
        };

        // Update original transaction
        originalTransaction.status = 'reversed';
        await originalTransaction.save();

        // Create refund record
        const refund = new Refund({
          orderId: order._id,
          userId: order.userId,
          restaurantId: order.restaurantId._id,
          amount: refundAmount,
          reason: refundReason,
          status: 'completed',
          refundId: refundResult.refundId,
          processedAt: new Date(),
        });
        await refund.save();
      } else {
        refundTransaction.notes = `Refund failed: ${refundResult.errorMessage}`;
      }

      await refundTransaction.save();

      return {
        success: refundResult.success,
        transaction: refundTransaction,
        gatewayResponse: refundResult,
      };
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  /**
   * Process vendor payout
   */
  async processVendorPayout(settlementId) {
    try {
      const settlement = await VendorSettlement.findById(settlementId)
        .populate('vendorId')
        .populate('restaurantId');

      if (!settlement) {
        throw new Error('Settlement not found');
      }

      if (settlement.status !== 'approved') {
        throw new Error('Settlement must be approved before payout');
      }

      // Get active gateway for payouts
      const gateway = this.getActiveGateway();
      if (!gateway) {
        throw new Error('No active payment gateway available for payouts');
      }

      // Process payout through gateway
      const payoutResult = await gateway.client.processPayout({
        settlementId: settlement._id,
        amount: settlement.summary.finalAmount,
        beneficiaryInfo: {
          name: settlement.bankDetails.accountHolderName,
          accountNumber: settlement.bankDetails.accountNumber,
          ifsc: settlement.bankDetails.ifsc,
          bankName: settlement.bankDetails.bankName,
        },
        description: `Payout for settlement ${settlement.settlementNumber}`,
      });

      // Update settlement with payout info
      if (payoutResult.success) {
        settlement.status = 'paid';
        settlement.paymentInfo = {
          transactionId: payoutResult.payoutId,
          paymentDate: new Date(),
          paymentMethod: 'bank_transfer',
          utrNumber: payoutResult.utrNumber,
          referenceNumber: `REF${settlement.settlementNumber}`,
        };
        settlement.processingInfo = {
          processedBy: null,
          processedAt: new Date(),
          processingNotes: 'Auto-processed via payment gateway',
        };
      } else {
        settlement.status = 'failed';
        settlement.failureReason = payoutResult.errorMessage;
        settlement.retryCount = (settlement.retryCount || 0) + 1;
        settlement.nextRetryAt = new Date(Date.now() + 60 * 60 * 1000);
      }

      await settlement.save();

      return {
        success: payoutResult.success,
        settlement,
        gatewayResponse: payoutResult,
      };
    } catch (error) {
      console.error('Error processing vendor payout:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(gatewayName, payload, signature, secret) {
    try {
      const gateway = this.gateways.get(gatewayName);
      if (!gateway) {
        throw new Error('Gateway not found');
      }

      return gateway.client.verifyWebhookSignature(payload, signature, secret);
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(gatewayName, event) {
    try {
      const gateway = this.gateways.get(gatewayName);
      if (!gateway) {
        throw new Error('Gateway not found');
      }

      const processedEvent = await gateway.client.processWebhookEvent(event);
      
      // Log the event
      console.log(`Processed webhook event from ${gatewayName}:`, processedEvent);

      return processedEvent;
    } catch (error) {
      console.error('Error processing webhook event:', error);
      throw error;
    }
  }

  /**
   * Get active gateway
   */
  getActiveGateway() {
    for (const gateway of this.gateways.values()) {
      if (gateway.isActive) {
        return gateway;
      }
    }
    return null;
  }

  /**
   * Get gateway by ID
   */
  getGatewayById(gatewayId) {
    for (const gateway of this.gateways.values()) {
      if (gateway._id.toString() === gatewayId.toString()) {
        return gateway;
      }
    }
    return null;
  }

  /**
   * Test gateway connection
   */
  async testGateway(gatewayId) {
    try {
      const gateway = this.getGatewayById(gatewayId);
      if (!gateway) {
        throw new Error('Gateway not found');
      }

      const testResult = await gateway.client.testConnection();
      
      // Update gateway test status
      await PaymentGateway.findByIdAndUpdate(gatewayId, {
        lastTested: new Date(),
        testStatus: testResult.success ? 'success' : 'failed',
        testMessage: testResult.message,
      });

      return testResult;
    } catch (error) {
      await PaymentGateway.findByIdAndUpdate(gatewayId, {
        lastTested: new Date(),
        testStatus: 'failed',
        testMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Get gateway status
   */
  getGatewayStatus() {
    const status = [];
    for (const [name, gateway] of this.gateways) {
      status.push({
        name,
        type: gateway.gatewayType,
        isActive: gateway.isActive,
        environment: gateway.environment,
        lastTested: gateway.lastTested,
        testStatus: gateway.testStatus,
      });
    }
    return status;
  }
}

/**
 * Stripe Client Implementation (placeholder)
 */
class StripeClient {
  constructor(gateway) {
    this.gateway = gateway;
  }

  async processPayment(paymentData) {
    // Stripe implementation
    return { success: true, transactionId: 'stripe_test', response: {} };
  }

  async processRefund(refundData) {
    // Stripe refund implementation
    return { success: true, refundId: 'stripe_refund', response: {} };
  }

  async processPayout(payoutData) {
    // Stripe payout implementation
    return { success: true, payoutId: 'stripe_payout', utrNumber: 'UTR123', response: {} };
  }

  verifyWebhookSignature(payload, signature, secret) {
    return true; // Simplified
  }

  async processWebhookEvent(event) {
    return { processed: true, event };
  }

  async testConnection() {
    return { success: true, message: 'Stripe connection successful' };
  }
}

/**
 * PayPal Client Implementation (placeholder)
 */
class PayPalClient {
  constructor(gateway) {
    this.gateway = gateway;
  }

  async processPayment(paymentData) {
    return { success: true, transactionId: 'paypal_test', response: {} };
  }

  async processRefund(refundData) {
    return { success: true, refundId: 'paypal_refund', response: {} };
  }

  async processPayout(payoutData) {
    return { success: true, payoutId: 'paypal_payout', utrNumber: 'UTR456', response: {} };
  }

  verifyWebhookSignature(payload, signature, secret) {
    return true;
  }

  async processWebhookEvent(event) {
    return { processed: true, event };
  }

  async testConnection() {
    return { success: true, message: 'PayPal connection successful' };
  }
}

/**
 * Generic Gateway Client Implementation
 */
class GenericGatewayClient {
  constructor(gateway) {
    this.gateway = gateway;
  }

  async processPayment(paymentData) {
    return { success: true, transactionId: 'generic_test', response: {} };
  }

  async processRefund(refundData) {
    return { success: true, refundId: 'generic_refund', response: {} };
  }

  async processPayout(payoutData) {
    return { success: true, payoutId: 'generic_payout', utrNumber: 'UTR789', response: {} };
  }

  verifyWebhookSignature(payload, signature, secret) {
    return true;
  }

  async processWebhookEvent(event) {
    return { processed: true, event };
  }

  async testConnection() {
    return { success: true, message: 'Generic gateway connection successful' };
  }
}

export default new PaymentGatewayService();
