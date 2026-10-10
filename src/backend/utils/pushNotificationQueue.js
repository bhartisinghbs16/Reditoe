/**
 * Push Notification Queue Manager
 * Handles notification queuing, retry logic, and delivery tracking
 * Ensures reliable push notification delivery with proper error handling
 */

import pushNotificationService from '../services/pushNotificationService.js';
import NotificationLog from '../models/NotificationLog.js';

/**
 * @typedef {Object} NotificationJob
 * @property {string} id
 * @property {'single'|'multiple'|'broadcast'} type
 * @property {string[]} recipients - User IDs
 * @property {Object} notification
 * @property {string} notification.title
 * @property {string} notification.body
 * @property {string} [notification.imageUrl]
 * @property {string} [notification.sound]
 * @property {Record<string, any>} data
 * @property {'high'|'normal'|'low'} priority
 * @property {number} retryCount
 * @property {number} maxRetries
 * @property {number} delay - milliseconds
 * @property {Date} scheduledAt
 * @property {Date} createdAt
 * @property {Array<Object>} attempts
 * @property {Date} attempts.timestamp
 * @property {boolean} attempts.success
 * @property {string} [attempts.error]
 * @property {any} [attempts.response]
 * @property {Function} [resolve]
 * @property {Function} [reject]
 */

class PushNotificationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.maxQueueSize = 1000;
    this.retryDelays = [1000, 5000, 15000, 30000, 60000]; // Progressive delays
    this.cleanupInterval = 60 * 60 * 1000; // 1 hour
    this.maxJobAge = 24 * 60 * 60 * 1000; // 24 hours
    this.startCleanup();
  }

  /**
   * Add notification to queue
   */
  async addNotification(
    recipients,
    notification,
    data = {},
    options = {}
  ) {
    const jobId = this.generateJobId();
    const userIds = Array.isArray(recipients) ? recipients : [recipients];

    const job = {
      id: jobId,
      type: userIds.length === 1 ? 'single' : userIds.length > 1 ? 'multiple' : 'broadcast',
      recipients: userIds,
      notification,
      data,
      priority: options.priority || 'normal',
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      delay: options.delay || 0,
      scheduledAt: new Date(Date.now() + (options.delay || 0)),
      createdAt: new Date(),
      attempts: [],
    };

    // Add to queue based on priority
    if (job.priority === 'high') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    // Limit queue size
    if (this.queue.length > this.maxQueueSize) {
      const removed = this.queue.splice(this.maxQueueSize);
      console.warn(`📱 Notification queue full, removed ${removed.length} jobs`);
    }

    console.log(`📱 Notification queued: ${jobId} (${job.type}) to ${userIds.length} recipients`);
    this.processQueue();

    return jobId;
  }

  /**
   * Process notification queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.find(j => 
          j.scheduledAt <= new Date() && j.retryCount < j.maxRetries
        );

        if (!job) {
          break; // No jobs ready to process
        }

        // Remove job from queue
        const index = this.queue.indexOf(job);
        this.queue.splice(index, 1);

        // Process job
        await this.processJob(job);
      }
    } catch (error) {
      console.error('❌ Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual notification job
   */
  async processJob(job) {
    try {
      console.log(`📱 Processing notification job: ${job.id}`);

      const attempt = {
        timestamp: new Date(),
        success: false,
        error: undefined,
        response: undefined,
      };

      let success = false;

      // Initialize push notification service
      await pushNotificationService.initialize();

      // Send notification based on type
      switch (job.type) {
        case 'single':
          success = await pushNotificationService.sendToUser(
            job.recipients[0],
            job.notification,
            job.data
          );
          break;
        case 'multiple':
          success = await pushNotificationService.sendToMultipleUsers(
            job.recipients,
            job.notification,
            job.data
          );
          break;
        case 'broadcast':
          // For broadcast, get all users with tokens
          success = await this.sendBroadcast(job);
          break;
      }

      attempt.success = success;
      attempt.response = { success };

      // Log attempt
      job.attempts.push(attempt);

      // Handle success/failure
      if (success) {
        console.log(`✅ Notification job succeeded: ${job.id}`);
        await this.logNotification(job, 'success');
        
        // Resolve promise if exists
        if (job.resolve) {
          job.resolve({ success, jobId: job.id });
        }
      } else {
        await this.handleJobFailure(job);
      }

    } catch (error) {
      console.error(`❌ Error processing notification job ${job.id}:`, error);
      
      const attempt = {
        timestamp: new Date(),
        success: false,
        error: error.message,
      };

      job.attempts.push(attempt);
      await this.handleJobFailure(job);
    }
  }

  /**
   * Handle job failure
   */
  async handleJobFailure(job) {
    job.retryCount++;

    if (job.retryCount < job.maxRetries) {
      // Schedule retry
      const delay = this.retryDelays[Math.min(job.retryCount - 1, this.retryDelays.length - 1)];
      job.scheduledAt = new Date(Date.now() + delay);

      // Re-add to queue
      this.queue.push(job);
      
      console.log(`🔄 Notification job ${job.id} scheduled for retry ${job.retryCount}/${job.maxRetries} in ${delay}ms`);
      await this.logNotification(job, 'retry');
    } else {
      // Max retries reached
      console.error(`❌ Notification job ${job.id} failed after ${job.maxRetries} attempts`);
      await this.logNotification(job, 'failed');
      
      // Reject promise if exists
      if (job.reject) {
        job.reject(new Error(`Notification failed after ${job.maxRetries} attempts`));
      }
    }
  }

  /**
   * Send broadcast notification
   */
  async sendBroadcast(job) {
    // This would typically send to all users or a large segment
    // For now, treat as multiple users
    return await pushNotificationService.sendToMultipleUsers(
      job.recipients,
      job.notification,
      job.data
    );
  }

  /**
   * Log notification to database
   */
  async logNotification(job, status) {
    try {
      await NotificationLog.create({
        jobId: job.id,
        type: job.type,
        recipients: job.recipients,
        notification: job.notification,
        data: job.data,
        priority: job.priority,
        status,
        attempts: job.attempts.length,
        retryCount: job.retryCount,
        createdAt: job.createdAt,
        processedAt: status === 'success' ? new Date() : undefined,
        error: status === 'failed' ? job.attempts[job.attempts.length - 1]?.error : undefined,
      });
    } catch (error) {
      console.error('❌ Error logging notification:', error);
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const totalJobs = this.queue.length;
    const processingJobs = this.queue.filter(j => j.scheduledAt <= new Date()).length;
    const pendingJobs = this.queue.filter(j => j.scheduledAt > new Date()).length;
    
    // Calculate success rate and average retries from recent jobs
    const recentJobs = this.queue.slice(-100); // Last 100 jobs
    const successfulJobs = recentJobs.filter(j => j.attempts.some(a => a.success)).length;
    const successRate = recentJobs.length > 0 ? (successfulJobs / recentJobs.length) * 100 : 0;
    
    const totalAttempts = recentJobs.reduce((sum, job) => sum + job.attempts.length, 0);
    const averageRetries = recentJobs.length > 0 ? totalAttempts / recentJobs.length : 0;

    return {
      totalJobs,
      processingJobs,
      pendingJobs,
      failedJobs: this.queue.filter(j => j.retryCount >= j.maxRetries).length,
      successRate: Math.round(successRate * 100) / 100,
      averageRetries: Math.round(averageRetries * 100) / 100,
    };
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return this.queue.find(job => job.id === jobId) || null;
  }

  /**
   * Cancel job
   */
  cancelJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index >= 0) {
      const job = this.queue[index];
      this.queue.splice(index, 1);
      
      if (job.reject) {
        job.reject(new Error('Job cancelled'));
      }
      
      console.log(`📱 Notification job cancelled: ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear queue
   */
  clearQueue() {
    const count = this.queue.length;
    this.queue = [];
    console.log(`📱 Notification queue cleared: ${count} jobs removed`);
    return count;
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
   * Clean up old jobs
   */
  cleanup() {
    const now = Date.now();
    const initialLength = this.queue.length;

    // Remove jobs older than max age
    this.queue = this.queue.filter(job => {
      const age = now - job.createdAt.getTime();
      return age < this.maxJobAge;
    });

    const removed = initialLength - this.queue.length;
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} old notification jobs`);
    }
  }

  /**
   * Get detailed queue information
   */
  getQueueInfo() {
    return {
      queue: this.queue.map(job => ({
        id: job.id,
        type: job.type,
        recipients: job.recipients.length,
        priority: job.priority,
        status: job.retryCount >= job.maxRetries ? 'failed' : 
                job.scheduledAt > new Date() ? 'pending' : 'processing',
        attempts: job.attempts.length,
        retryCount: job.retryCount,
        createdAt: job.createdAt,
        scheduledAt: job.scheduledAt,
      })),
      stats: this.getQueueStats(),
    };
  }

  /**
   * Pause processing
   */
  pause() {
    this.isProcessing = true;
    console.log('📱 Notification queue paused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.isProcessing = false;
    console.log('📱 Notification queue resumed');
    this.processQueue();
  }

  /**
   * Force process queue
   */
  async forceProcess() {
    console.log('📱 Force processing notification queue');
    await this.processQueue();
  }
}

// Singleton instance
const pushNotificationQueue = new PushNotificationQueue();

export default pushNotificationQueue;
