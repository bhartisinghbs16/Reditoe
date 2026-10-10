/**
 * Email Controller for email template and queue management
 * Additive only - does not modify existing functionality
 */
import EmailTemplate from '../../models/EmailTemplate.js';
import EmailQueue from '../../models/EmailQueue.js';
import emailService from '../../services/emailService.js';

/**
 * Get all email templates
 */
export const getEmailTemplates = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, organizationId, search } = req.query;
    
    let filter = { isActive: true };
    if (category) filter.category = category;
    if (organizationId) filter.organizationId = organizationId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const templates = await EmailTemplate.find(filter)
      .sort({ category: 1, displayName: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('organizationId', 'name slug');
    
    const total = await EmailTemplate.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching email templates',
      error: error.message
    });
  }
};

/**
 * Create a new email template
 */
export const createEmailTemplate = async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      category,
      subject,
      htmlContent,
      textContent,
      variables,
      styling,
      sendingConfig,
      previewData,
      organizationId
    } = req.body;
    
    // Check if template name already exists
    const existingTemplate = await EmailTemplate.findOne({ 
      name,
      organizationId: organizationId || null 
    });
    
    if (existingTemplate) {
      return res.status(400).json({
        status: 'error',
        message: 'Template with this name already exists'
      });
    }
    
    const template = new EmailTemplate({
      name,
      displayName,
      description,
      category,
      subject,
      htmlContent,
      textContent,
      variables: variables || [],
      styling: styling || {},
      sendingConfig: sendingConfig || {},
      previewData: previewData || {},
      organizationId: organizationId || req.user.organizationId || null
    });
    
    await template.save();
    
    res.status(201).json({
      status: 'success',
      data: {
        template
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating email template',
      error: error.message
    });
  }
};

/**
 * Update an email template
 */
export const updateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Increment version if content changed
    if (updateData.subject || updateData.htmlContent || updateData.textContent) {
      updateData.version = (await EmailTemplate.findById(id)).version + 1;
    }
    
    const template = await EmailTemplate.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Template not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        template
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error updating email template',
      error: error.message
    });
  }
};

/**
 * Delete/deactivate an email template
 */
export const deleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if template is being used
    const usageCount = await EmailQueue.countDocuments({ 
      templateName: (await EmailTemplate.findById(id)).name,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    if (usageCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete template that has been used recently. Deactivate it instead.'
      });
    }
    
    const template = await EmailTemplate.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Template not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Template deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting email template',
      error: error.message
    });
  }
};

/**
 * Preview email template with sample data
 */
export const previewEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { data = {} } = req.body;
    
    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Template not found'
      });
    }
    
    // Validate variables
    const errors = template.validateVariables({ ...template.previewData, ...data });
    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Template validation failed',
        errors
      });
    }
    
    const rendered = template.render({ ...template.previewData, ...data });
    
    res.status(200).json({
      status: 'success',
      data: {
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error previewing email template',
      error: error.message
    });
  }
};

/**
 * Send test email
 */
export const sendTestEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { to, data = {} } = req.body;
    
    if (!to) {
      return res.status(400).json({
        status: 'error',
        message: 'Recipient email is required'
      });
    }
    
    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Template not found'
      });
    }
    
    // Send test email
    const queueItem = await emailService.sendTemplateEmail(to, template.name, data, {
      category: template.category,
      userId: req.user._id,
      organizationId: req.user.organizationId || null,
      metadata: { isTest: true }
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Test email sent successfully',
      data: {
        queueId: queueItem._id
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error sending test email',
      error: error.message
    });
  }
};

/**
 * Get email queue
 */
export const getEmailQueue = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, organizationId } = req.query;
    
    let filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (organizationId) filter.organizationId = organizationId;
    
    const emails = await EmailQueue.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email')
      .populate('organizationId', 'name slug');
    
    const total = await EmailQueue.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        emails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching email queue',
      error: error.message
    });
  }
};

/**
 * Get email statistics
 */
export const getEmailStats = async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const stats = await emailService.getStats(start, end, organizationId);
    
    res.status(200).json({
      status: 'success',
      data: {
        stats,
        period: { start, end }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching email statistics',
      error: error.message
    });
  }
};

/**
 * Process email queue (manual trigger)
 */
export const processEmailQueue = async (req, res) => {
  try {
    const { limit = 100 } = req.body;
    
    const results = await emailService.processQueue(limit);
    
    res.status(200).json({
      status: 'success',
      message: 'Email queue processed',
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error processing email queue',
      error: error.message
    });
  }
};

/**
 * Retry failed emails
 */
export const retryFailedEmails = async (req, res) => {
  try {
    const { limit = 50 } = req.body;
    
    const results = await emailService.processRetries(limit);
    
    res.status(200).json({
      status: 'success',
      message: 'Failed emails retried',
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error retrying failed emails',
      error: error.message
    });
  }
};

/**
 * Handle webhook from email provider
 */
export const handleEmailWebhook = async (req, res) => {
  try {
    const { provider } = req.params;
    const events = req.body;
    
    const results = await emailService.handleWebhook(provider, events);
    
    res.status(200).json({
      status: 'success',
      message: 'Webhook processed',
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error handling webhook',
      error: error.message
    });
  }
};

/**
 * Get email categories
 */
export const getEmailCategories = async (req, res) => {
  try {
    const categories = await EmailTemplate.distinct('category');
    
    res.status(200).json({
      status: 'success',
      data: {
        categories: categories.sort()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching email categories',
      error: error.message
    });
  }
};
