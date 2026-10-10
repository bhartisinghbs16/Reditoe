/**
 * Payment Idempotency Manager
 * Handles idempotency keys for payment operations to prevent duplicate processing
 * Ensures payment consistency and prevents race conditions
 */

import crypto from 'crypto';
import PaymentLog from '../models/PaymentLog.js';

class PaymentIdempotencyManager {
  constructor() {
    this.idempotencyStore = new Map(); // In-memory store for production use Redis
    this.cleanupInterval = 30 * 60 * 1000; // 30 minutes
    this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Generate idempotency key from request data
   */
  generateIdempotencyKey(orderId, userId, amount, paymentMethod = 'cashfree') {
    const data = `${orderId}:${userId}:${amount}:${paymentMethod}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if payment with idempotency key already exists
   */
  async checkIdempotency(idempotencyKey) {
    // Check in-memory store first
    if (this.idempotencyStore.has(idempotencyKey)) {
      const stored = this.idempotencyStore.get(idempotencyKey);
      if (Date.now() - stored.timestamp < this.maxAge) {
        return {
          exists: true,
          data: stored.data,
          status: stored.status,
        };
      } else {
        // Clean up expired entry
        this.idempotencyStore.delete(idempotencyKey);
      }
    }

    // Check database for persistent storage
    try {
      const existingLog = await PaymentLog.findOne({
        'metadata.idempotencyKey': idempotencyKey,
        createdAt: { $gte: new Date(Date.now() - this.maxAge) }
      }).sort({ createdAt: -1 });

      if (existingLog) {
        // Cache in memory for faster access
        this.idempotencyStore.set(idempotencyKey, {
          data: existingLog.metadata,
          status: existingLog.status,
          timestamp: existingLog.createdAt.getTime(),
        });

        return {
          exists: true,
          data: existingLog.metadata,
          status: existingLog.status,
        };
      }
    } catch (error) {
      console.error('Error checking idempotency in database:', error);
    }

    return { exists: false };
  }

  /**
   * Store idempotency key with payment data
   */
  async storeIdempotency(idempotencyKey, paymentData, status = 'pending') {
    const timestamp = Date.now();
    
    // Store in memory
    this.idempotencyStore.set(idempotencyKey, {
      data: paymentData,
      status,
      timestamp,
    });

    // Store in database for persistence
    try {
      await PaymentLog.create({
        paymentId: paymentData.paymentId || 'pending',
        orderId: paymentData.orderId,
        status,
        amount: paymentData.amount,
        metadata: {
          ...paymentData,
          idempotencyKey,
          timestamp: new Date(timestamp).toISOString(),
        },
      });
    } catch (error) {
      console.error('Error storing idempotency in database:', error);
      // Continue even if database storage fails
    }
  }

  /**
   * Update idempotency status
   */
  async updateIdempotencyStatus(idempotencyKey, status, updateData = {}) {
    // Update in memory
    if (this.idempotencyStore.has(idempotencyKey)) {
      const stored = this.idempotencyStore.get(idempotencyKey);
      stored.status = status;
      stored.data = { ...stored.data, ...updateData };
      stored.timestamp = Date.now();
    }

    // Update in database
    try {
      await PaymentLog.updateOne(
        { 'metadata.idempotencyKey': idempotencyKey },
        {
          $set: {
            status,
            'metadata': { $set: updateData },
            updatedAt: new Date(),
          }
        }
      );
    } catch (error) {
      console.error('Error updating idempotency status:', error);
    }
  }

  /**
   * Check for duplicate payment
   */
  async checkDuplicatePayment(orderId, userId, amount, paymentMethod = 'cashfree') {
    const idempotencyKey = this.generateIdempotencyKey(orderId, userId, amount, paymentMethod);
    return await this.checkIdempotency(idempotencyKey);
  }

  /**
   * Store payment attempt
   */
  async storePaymentAttempt(orderId, userId, amount, paymentData, paymentMethod = 'cashfree') {
    const idempotencyKey = this.generateIdempotencyKey(orderId, userId, amount, paymentMethod);
    const data = {
      orderId,
      userId,
      amount,
      paymentMethod,
      ...paymentData,
    };
    
    await this.storeIdempotency(idempotencyKey, data, 'pending');
    return idempotencyKey;
  }

  /**
   * Mark payment as successful
   */
  async markPaymentSuccess(idempotencyKey, paymentData) {
    await this.updateIdempotencyStatus(idempotencyKey, 'success', paymentData);
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(idempotencyKey, errorData) {
    await this.updateIdempotencyStatus(idempotencyKey, 'failed', errorData);
  }

  /**
   * Get payment status by idempotency key
   */
  async getPaymentStatus(idempotencyKey) {
    const result = await this.checkIdempotency(idempotencyKey);
    return result.exists ? result.status : null;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.idempotencyStore.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.idempotencyStore.delete(key);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      memoryStoreSize: this.idempotencyStore.size,
      maxAge: this.maxAge,
      cleanupInterval: this.cleanupInterval,
    };
  }
}

// Singleton instance
const paymentIdempotencyManager = new PaymentIdempotencyManager();

export default paymentIdempotencyManager;
