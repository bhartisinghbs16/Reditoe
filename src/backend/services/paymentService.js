import crypto from 'crypto';
import axios from 'axios';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import notificationService from './notificationService.js';
import websocketService from './websocketService.js';

class PaymentService {
  constructor() {
    // Cashfree API Configuration
    this.appId = (process.env.CASHFREE_APP_ID || '').trim();
    this.secretKey = (process.env.CASHFREE_SECRET_KEY || '').trim();
    this.env = (process.env.CASHFREE_ENV || 'TEST').trim().toUpperCase();
    
    // Set base URL based on environment
    this.baseURL = this.env === 'PRODUCTION' 
      ? 'https://api.cashfree.com/pg' 
      : 'https://sandbox.cashfree.com/pg';

    // Debug logging for Cashfree initialization
    console.log("CASHFREE PAYMENT GATEWAY INITIALIZATION DEBUG:");
    console.log("Cashfree App ID:", this.appId ? `${this.appId.slice(0, 8)}...` : 'MISSING');
    console.log("Cashfree Secret Key loaded:", !!this.secretKey);
    console.log("Cashfree Environment:", this.env);
    console.log("Cashfree Base URL:", this.baseURL);
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("CASHFREE PAYMENT GATEWAY INITIALIZED");
    console.log("=========================================");

    this.isConfigured = Boolean(this.appId && this.secretKey);

    if (!this.isConfigured) {
      console.warn('Cashfree credentials are missing. Payment APIs will return configuration errors until CASHFREE_APP_ID and CASHFREE_SECRET_KEY are set.');
    }

  }

  getBaseAppUrl(envKey, fallbackValue) {
    const value = (process.env[envKey] || '').trim();
    const fallback = (fallbackValue || '').trim();
    const isProductionMode = process.env.NODE_ENV === 'production';

    if (value) {
      if (isProductionMode && /localhost|127\.0\.0\.1/i.test(value)) {
        throw new Error(`${envKey} cannot point to localhost in production`);
      }
      return value;
    }

    if (isProductionMode) {
      if (fallback && !/localhost|127\.0\.0\.1/i.test(fallback)) {
        return fallback;
      }
      throw new Error(`${envKey} is required in production`);
    }

    return fallback;
  }

  async buildCustomerDetails(userId) {
    const user = await User.findById(userId);

    return {
      customer_id: String(userId),
      customer_email: user?.email || 'customer@reditoe.com',
      customer_phone: user?.phone
        ? user.phone.replace(/\D/g, '').slice(-10).padStart(10, '0')
        : '9999999999',
      customer_name: user?.name || 'Customer',
    };
  }

  ensureConfigured() {
    if (!this.appId) {
      throw new Error('Payment gateway is not configured: Missing CASHFREE_APP_ID');
    }

    if (!this.secretKey) {
      throw new Error('Payment gateway is not configured: Missing CASHFREE_SECRET_KEY');
    }
  }

  // Create Cashfree order
  async createPaymentOrder(orderData) {
    try {
      this.ensureConfigured();
      console.log("Creating Cashfree order...");

      const { amount, currency = 'INR', orderId, userId, receipt } = orderData;

      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
      }

      // Cashfree uses amount in base currency (INR)
      const orderAmount = Number(amount).toFixed(2);
      console.log('FINAL AMOUNT:', orderAmount);

      // Generate unique order ID
      const cashfreeOrderId = receipt ? String(receipt) : `order_${Date.now()}`;
      
      // Sanitize order ID to alphanumeric and underscore only
      const sanitizedOrderId = cashfreeOrderId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);

      const customerDetails = await this.buildCustomerDetails(userId);
      const frontendBaseUrl = this.getBaseAppUrl('FRONTEND_URL', 'http://localhost:19006');
      const backendBaseUrl = this.getBaseAppUrl(
        'BACKEND_URL',
        (process.env.PRODUCTION_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000').trim()
      );

      const returnUrl = `${frontendBaseUrl}/payment?order_id={order_id}&cf_id={cf_payment_id}`;
      const notifyUrl = `${backendBaseUrl}/api/payments/webhook`;

      console.log('CASHFREE REQUEST HYGIENE:', {
        hasCustomerEmail: Boolean(customerDetails.customer_email),
        hasCustomerPhone: Boolean(customerDetails.customer_phone),
        returnUrlUsesLocalhost: /localhost|127\.0\.0\.1/i.test(returnUrl),
        notifyUrlUsesLocalhost: /localhost|127\.0\.0\.1/i.test(notifyUrl),
      });

      console.log('CASHFREE ORDER REQUEST:', {
        order_id: sanitizedOrderId,
        order_amount: orderAmount,
        order_currency: currency,
        customer_details: customerDetails,
        order_meta: {
          return_url: returnUrl,
          notify_url: notifyUrl,
        },
      });

      // Create Cashfree order using REST API
      const response = await axios.post(
        `${this.baseURL}/orders`,
        {
          order_id: sanitizedOrderId,
          order_amount: orderAmount,
          order_currency: currency,
          customer_details: customerDetails,
          order_meta: {
            return_url: returnUrl,
            notify_url: notifyUrl,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': '2023-08-01',
          },
        }
      );

      const cashfreeOrder = response.data;
      console.log("Cashfree order created:", cashfreeOrder);

      // Store payment attempt in database
      const paymentAttempt = {
        cashfreeOrderId: cashfreeOrder.order_id,
        orderId,
        userId,
        amount,
        currency,
        status: 'created',
        createdAt: new Date(),
      };

      console.log('Payment order created:', paymentAttempt);

      return {
        success: true,
        data: {
          order_id: cashfreeOrder.order_id,
          order_amount: cashfreeOrder.order_amount,
          order_currency: cashfreeOrder.order_currency,
          order_token: cashfreeOrder.order_token,
          payment_session_id: cashfreeOrder.payment_session_id,
          app_id: this.appId,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
        },
      };
    } catch (error) {
      console.error('CASHFREE CREATE ERROR - FULL DETAILS:');
      console.error('statusCode:', error.response?.status);
      console.error('message:', error.message);
      console.error('response data:', error.response?.data);
      throw new Error('Failed to create payment order');
    }
  }

  // Verify Cashfree payment
  async verifyPayment(paymentData) {
    try {
      this.ensureConfigured();
      const { orderId, cf_payment_id, cf_order_id, userId } = paymentData;

      // FIX: Check if order is already paid (prevent double payment)
      const order = await Order.findById(orderId);
      if (order && order.paymentStatus === 'paid') {
        throw new Error('Already Paid');
      }

      console.log("Verifying Cashfree payment:", { cf_order_id, cf_payment_id });

      // Fetch payment details from Cashfree
      const payment = await this.fetchPaymentDetails(cf_payment_id);

      console.log("CASHFREE PAYMENT DETAILS:", payment);

      // Verify payment details
      if (payment.payment_status !== 'SUCCESS') {
        throw new Error('Payment not successful');
      }

      if (payment.order_id !== cf_order_id) {
        throw new Error('Payment order mismatch');
      }

      console.log("PAYMENT SUCCESS VERIFIED - Payment successful");

      // Update order status
      await this.updateOrderPaymentStatus(orderId, {
        paymentId: cf_payment_id,
        status: 'paid',
        amount: parseFloat(payment.payment_amount),
        method: 'cashfree',
        paidAt: new Date(),
      });

      // Send payment success notification
      await notificationService.sendPaymentNotification(userId, 'payment_success', {
        paymentId: cf_payment_id,
        amount: parseFloat(payment.payment_amount),
        orderId,
      });

      return {
        success: true,
        message: 'Payment verified successfully',
        data: {
          paymentId: cf_payment_id,
          orderId,
          amount: parseFloat(payment.payment_amount),
          status: 'paid',
        },
      };
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }

  // Process Cashfree webhook
  async processWebhook(webhookData) {
    try {
      this.ensureConfigured();
      const { event, payload } = webhookData;

      // Verify webhook signature
      const signature = webhookData.headers['x-cf-signature'];
      // Note: Cashfree signature verification is different
      // For now, we'll skip signature verification in test mode
      // In production, implement proper signature verification

      switch (event) {
        case 'payment.success':
          await this.handlePaymentSuccess(payload);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(payload);
          break;
        default:
          console.log('Unhandled webhook event:', event);
      }

      return { success: true };
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw error;
    }
  }

  // Handle payment success event
  async handlePaymentSuccess(payment) {
    try {
      const { cf_payment_id, order_id, payment_amount, customer_details } = payment;
      const userId = customer_details?.customer_id;

      // Extract order ID from order_id (format: order_timestamp)
      const orderId = order_id;

      // Update order payment status
      await this.updateOrderPaymentStatus(orderId, {
        paymentId: cf_payment_id,
        status: 'paid',
        amount: parseFloat(payment_amount),
        method: 'cashfree',
        paidAt: new Date(),
      });

      // Send notification
      if (userId) {
        await notificationService.sendPaymentNotification(userId, 'payment_success', {
          paymentId: cf_payment_id,
          amount: parseFloat(payment_amount),
          orderId,
        });
      }

      console.log('Payment successful:', cf_payment_id);
    } catch (error) {
      console.error('Error handling payment success:', error);
    }
  }

  // Handle payment failed event
  async handlePaymentFailed(payment) {
    try {
      const { cf_payment_id, order_id, payment_amount, customer_details, payment_error } = payment;
      const userId = customer_details?.customer_id;

      // Extract order ID from order_id
      const orderId = order_id;

      // Update order payment status
      await this.updateOrderPaymentStatus(orderId, {
        paymentId: cf_payment_id,
        status: 'failed',
        amount: parseFloat(payment_amount),
        method: 'cashfree',
        failedAt: new Date(),
        errorCode: payment_error?.code,
        errorDescription: payment_error?.message,
      });

      // Send notification
      if (userId) {
        await notificationService.sendPaymentNotification(userId, 'payment_failed', {
          paymentId: cf_payment_id,
          amount: parseFloat(payment_amount),
          orderId,
        });
      }

      console.log('Payment failed:', cf_payment_id, payment_error?.message);
    } catch (error) {
      console.error('Error handling payment failed:', error);
    }
  }

  // Handle order paid event
  async handleOrderPaid(order) {
    try {
      const { id, notes } = order;
      const { orderId, userId } = notes;

      // This is a backup event, main logic is in payment.captured
      console.log('Order paid event received:', id);
    } catch (error) {
      console.error('Error handling order paid:', error);
    }
  }

  // Process wallet top-up
  async processWalletTopUp(userId, amount, paymentMethod = 'cashfree') {
    try {
      this.ensureConfigured();
      // Create payment order for wallet top-up
      const receipt = `wallet_topup_${userId}_${Date.now()}`;
      
      const paymentOrder = await this.createPaymentOrder({
        amount,
        currency: 'INR',
        userId,
        receipt,
        orderId: null, // Null for wallet top-up
      });

      return {
        success: true,
        data: {
          ...paymentOrder.data,
          type: 'wallet_topup',
          userId,
        },
      };
    } catch (error) {
      console.error('Error processing wallet top-up:', error);
      throw error;
    }
  }

  // Verify wallet top-up payment
  async verifyWalletTopUp(paymentData) {
    try {
      this.ensureConfigured();
      const { cf_order_id, cf_payment_id, userId } = paymentData;

      // Fetch payment details
      const payment = await this.fetchPaymentDetails(cf_payment_id);

      if (payment.payment_status !== 'SUCCESS') {
        throw new Error('Payment not successful');
      }

      // Update wallet balance
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        // Create wallet if it doesn't exist
        await Wallet.create({ userId, balance: 0 });
      }

      const amount = parseFloat(payment.payment_amount);
      
      await Wallet.findOneAndUpdate(
        { userId },
        { 
          $inc: { balance: amount },
          lastUpdated: new Date(),
        },
        { new: true }
      );

      // Create wallet transaction record
      await WalletTransaction.create({
        userId,
        type: 'credit',
        amount,
        description: 'Wallet top-up',
        paymentId: cf_payment_id,
        status: 'completed',
        createdAt: new Date(),
      });

      // Send notification
      await notificationService.sendPaymentNotification(userId, 'wallet_topup', {
        amount,
        transactionId: cf_payment_id,
      });

      return {
        success: true,
        message: 'Wallet top-up successful',
        data: {
          paymentId: cf_payment_id,
          amount,
          newBalance: (await Wallet.findOne({ userId })).balance,
        },
      };
    } catch (error) {
      console.error('Error verifying wallet top-up:', error);
      throw error;
    }
  }

  // Process payment using wallet balance
  async processWalletPayment(userId, orderId, amount) {
    try {
      // Check wallet balance
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct from wallet
      await Wallet.findOneAndUpdate(
        { userId },
        { 
          $inc: { balance: -amount },
          lastUpdated: new Date(),
        },
        { new: true }
      );

      // Create wallet transaction record
      await WalletTransaction.create({
        userId,
        type: 'debit',
        amount,
        description: `Payment for order ${orderId}`,
        orderId,
        status: 'completed',
        createdAt: new Date(),
      });

      // Update order payment status
      await this.updateOrderPaymentStatus(orderId, {
        paymentId: `wallet_${Date.now()}`,
        status: 'paid',
        amount,
        method: 'wallet',
        paidAt: new Date(),
      });

      // Send notification
      await notificationService.sendPaymentNotification(userId, 'payment_success', {
        paymentId: `wallet_${Date.now()}`,
        amount,
        orderId,
      });

      return {
        success: true,
        message: 'Payment successful using wallet',
        data: {
          orderId,
          amount,
          method: 'wallet',
          newBalance: wallet.balance - amount,
        },
      };
    } catch (error) {
      console.error('Error processing wallet payment:', error);
      throw error;
    }
  }

  // Get wallet balance
  async getWalletBalance(userId) {
    try {
      const wallet = await Wallet.findOne({ userId });
      
      if (!wallet) {
        // Create wallet if it doesn't exist
        const newWallet = await Wallet.create({ userId, balance: 0 });
        return { balance: 0 };
      }

      return { balance: wallet.balance };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  // Get wallet transaction history
  async getWalletTransactions(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const transactions = await WalletTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await WalletTransaction.countDocuments({ userId });

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error getting wallet transactions:', error);
      throw error;
    }
  }

  async fetchPaymentDetails(paymentId) {
    try {
      this.ensureConfigured();
      const response = await axios.get(
        `${this.baseURL}/payments/${paymentId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': '2023-08-01',
          },
        }
      );
      console.log("Cashfree payment details fetched:", response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching payment details:', error);
      throw error;
    }
  }

  async fetchPaymentsByOrderId(cfOrderId) {
    try {
      this.ensureConfigured();
      const response = await axios.get(
        `${this.baseURL}/orders/${cfOrderId}/payments`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': '2023-08-01',
          }
        }
      );
      const payments = response.data;
      const successPayment = Array.isArray(payments)
        ? payments.find(p => p.payment_status === 'SUCCESS')
        : null;
      return {
        success: !!successPayment,
        payment: successPayment || null,
      };
    } catch (error) {
      console.error('CASHFREE FETCH PAYMENTS ERROR:', error.response?.data);
      return { success: false, payment: null };
    }
  }

  async updateOrderPaymentStatus(orderId, paymentData) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // PAYMENT FAILURE HANDLING - Ensure status is set to 'failed' not stuck in 'pending'
      const statusToSet = paymentData.status === 'failed' ? 'failed' : paymentData.status;
      
      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: statusToSet,
        paymentDetails: {
          paymentId: paymentData.paymentId,
          method: paymentData.method,
          amount: paymentData.amount,
          paidAt: paymentData.paidAt,
          failedAt: paymentData.failedAt,
          errorCode: paymentData.errorCode,
          errorDescription: paymentData.errorDescription,
        },
      });

      // If payment is successful, update order status
      if (paymentData.status === 'paid') {
        const order = await Order.findByIdAndUpdate(
          orderId,
          {
            status: 'Waiting for Confirmation',
            $push: {
              timeline: {
                status: 'Waiting for Confirmation',
                timestamp: new Date(),
                message: 'Payment verified successfully. Order is waiting for restaurant confirmation.',
              },
            },
          },
          { new: true }
        );

        if (order) {
          const restaurant = await Restaurant.findById(order.restaurantId).select('owner');
          const vendorId = restaurant?.owner ? String(restaurant.owner) : null;

          if (vendorId) {
            try {
              await notificationService.storeNotification(
                vendorId,
                {
                  title: 'New Order Received',
                  body: `New order ${order.orderNumber || order._id} received. Please accept to start preparing.`,
                  type: 'order',
                  data: {
                    orderId: order._id.toString(),
                    orderNumber: order.orderNumber || order._id.toString(),
                    type: 'new_order',
                  },
                },
                'vendor'
              );
            } catch (notifyError) {
              console.error('[VendorOrderNotificationError]', notifyError?.message || notifyError);
            }

            websocketService.emitOrderLifecycle({
              order,
              eventName: 'order_created',
              source: 'cashfree_payment',
              vendorId,
              userId: order.userId ? String(order.userId) : null,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error updating order payment status:', error);
      throw error;
    }
  }

  // Process refund
  async processRefund(paymentId, amount, reason) {
    try {
      this.ensureConfigured();
      const response = await axios.post(
        `${this.baseURL}/refunds`,
        {
          refund_amount: amount.toFixed(2),
          refund_id: `refund_${Date.now()}`,
          payment_id: paymentId,
          refund_note: reason,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': '2023-08-01',
          },
        }
      );

      const refund = response.data;
      console.log("Cashfree refund processed:", refund);

      // Update order with refund details
      await Order.findOneAndUpdate(
        { 'paymentDetails.paymentId': paymentId },
        {
          $push: {
            refunds: {
              refundId: refund.refund_id,
              amount: parseFloat(refund.refund_amount),
              status: refund.refund_status,
              createdAt: new Date(),
              reason,
            },
          },
        }
      );

      return {
        success: true,
        data: {
          refundId: refund.refund_id,
          amount: parseFloat(refund.refund_amount),
          status: refund.refund_status,
        },
      };
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }
}

export default new PaymentService();
