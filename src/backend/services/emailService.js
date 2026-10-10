/**
 * Email Service for sending emails via various providers
 * Additive only - does not modify existing functionality
 */
import axios from 'axios';
import EmailTemplate from '../models/EmailTemplate.js';
import EmailQueue from '../models/EmailQueue.js';

console.log('📧 Email Service: Brevo API configured:', !!process.env.BREVO_API_KEY);

export const sendEmail = async (to, subject, html) => {
  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          email: process.env.EMAIL_FROM,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ EMAIL SENT VIA BREVO:', response.data);
    return true;
  } catch (error) {
    console.error(
      '❌ BREVO EMAIL ERROR:',
      error.response?.data || error.message
    );
    return false;
  }
};

class EmailService {
  constructor() {
    this.providers = {
      brevo: this.sendSMTP.bind(this),
      ses: this.sendSMTP.bind(this),
      smtp: this.sendSMTP.bind(this)
    };
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(to, templateName, data = {}, options = {}) {
    try {
      // Render template
      const rendered = await EmailTemplate.renderTemplate(templateName, data, options.organizationId);
      
      // Add to queue
      const queueItem = await EmailQueue.addToQueue({
        to,
        cc: options.cc || [],
        bcc: options.bcc || [],
        templateName,
        templateData: data,
        subject: rendered.subject,
        htmlContent: rendered.html,
        textContent: rendered.text,
        priority: options.priority || 'normal',
        scheduledAt: options.scheduledAt || new Date(),
        category: options.category || 'notification',
        userId: options.userId,
        organizationId: options.organizationId || null,
        provider: options.provider || 'ses',
        metadata: options.metadata || {}
      });

      // Try to send immediately if not scheduled
      if (!options.scheduledAt || options.scheduledAt <= new Date()) {
        await this.processEmail(queueItem);
      }

      return queueItem;
    } catch (error) {
      console.error('Error sending template email:', error);
      throw error;
    }
  }

  /**
   * Send direct email (without template)
   */
  async sendDirectEmail(to, subject, htmlContent, textContent, options = {}) {
    try {
      const queueItem = await EmailQueue.addToQueue({
        to,
        cc: options.cc || [],
        bcc: options.bcc || [],
        templateName: 'direct',
        templateData: {},
        subject,
        htmlContent,
        textContent,
        priority: options.priority || 'normal',
        scheduledAt: options.scheduledAt || new Date(),
        category: options.category || 'notification',
        userId: options.userId,
        organizationId: options.organizationId || null,
        provider: options.provider || 'ses',
        metadata: options.metadata || {}
      });

      if (!options.scheduledAt || options.scheduledAt <= new Date()) {
        await this.processEmail(queueItem);
      }

      return queueItem;
    } catch (error) {
      console.error('Error sending direct email:', error);
      throw error;
    }
  }

  /**
   * Process email from queue
   */
  async processEmail(queueItem) {
    try {
      await queueItem.markAsProcessing();
      
      const provider = this.providers[queueItem.provider];
      if (!provider) {
        throw new Error(`Unknown email provider: ${queueItem.provider}`);
      }

      const result = await provider(queueItem);
      await queueItem.markAsSent(result.messageId);
      
      return result;
    } catch (error) {
      await queueItem.markAsFailed(error.message, {
        stack: error.stack,
        provider: queueItem.provider
      });
      throw error;
    }
  }

  /**
   * Send email via SMTP (Brevo/SES/generic)
   */
  async sendSMTP(queueItem) {
    const emailSent = await sendEmail(queueItem.to, queueItem.subject, queueItem.htmlContent);
    if (!emailSent) {
      throw new Error('Brevo email send failed');
    }

    return {
      messageId: `brevo-${queueItem._id.toString()}`,
      provider: process.env.EMAIL_SERVICE || 'brevo'
    };
  }

  /**
   * @deprecated Use sendSMTP instead
   */
  async sendSES(queueItem) {
    return this.sendSMTP(queueItem);
  }

  /**
   * Process pending emails from queue
   */
  async processQueue(limit = 100) {
    try {
      const pendingEmails = await EmailQueue.getPendingEmails(limit);
      const results = [];

      for (const email of pendingEmails) {
        try {
          const result = await this.processEmail(email);
          results.push({ id: email._id, status: 'sent', result });
        } catch (error) {
          results.push({ id: email._id, status: 'failed', error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing email queue:', error);
      throw error;
    }
  }

  /**
   * Process retryable emails
   */
  async processRetries(limit = 50) {
    try {
      const retryableEmails = await EmailQueue.getRetryableEmails(limit);
      const results = [];

      for (const email of retryableEmails) {
        if (email.shouldRetry()) {
          try {
            const result = await this.processEmail(email);
            results.push({ id: email._id, status: 'sent', result });
          } catch (error) {
            results.push({ id: email._id, status: 'failed', error: error.message });
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing email retries:', error);
      throw error;
    }
  }

  /**
   * Handle webhook events from providers
   */
  async handleWebhook(provider, event) {
    try {
      switch (provider) {
        case 'ses':
          return this.handleSESWebhook(event);
        default:
          throw new Error(`Unknown webhook provider: ${provider}`);
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Handle SES webhook events
   */
  async handleSESWebhook(event) {
    // Implementation for SES webhook handling (SNS notifications)
    return [];
  }

  /**
   * Get email statistics
   */
  async getStats(startDate, endDate, organizationId = null) {
    try {
      const [stats, categoryStats, deliveryRate] = await Promise.all([
        EmailQueue.getEmailStats(startDate, endDate, organizationId),
        EmailQueue.getEmailsByCategory(startDate, endDate, organizationId),
        EmailQueue.getDeliveryRate(startDate, endDate, organizationId)
      ]);

      return {
        overview: stats[0]?.stats || [],
        categories: categoryStats,
        delivery: deliveryRate[0] || {
          deliveryRate: 0,
          openRate: 0,
          clickRate: 0,
          total: 0,
          sent: 0,
          failed: 0
        }
      };
    } catch (error) {
      console.error('Error getting email stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new EmailService();
