/**
 * Email Routes for email template and queue management
 * All protected by rbac middleware
 */
import express from 'express';
import {
  getEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  previewEmailTemplate,
  sendTestEmail,
  getEmailQueue,
  getEmailStats,
  processEmailQueue,
  retryFailedEmails,
  handleEmailWebhook,
  getEmailCategories,
} from '../../controllers/admin/adminEmailController.js';
import { rbacProtect, requirePermission, requireRole } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes except webhooks
router.use((req, res, next) => {
  if (req.path.includes('/webhook')) {
    return next(); // Skip auth for webhooks
  }
  return rbacProtect(req, res, next);
});

// Email template management (Super Admin and Marketing Admin)
router.get('/templates', requireRole(['super_admin', 'marketing_admin']), getEmailTemplates);
router.post('/templates', requireRole(['super_admin', 'marketing_admin']), createEmailTemplate);
router.put('/templates/:id', requireRole(['super_admin', 'marketing_admin']), updateEmailTemplate);
router.delete('/templates/:id', requireRole(['super_admin']), deleteEmailTemplate);

// Template preview and testing (Super Admin and Marketing Admin)
router.post('/templates/:id/preview', requireRole(['super_admin', 'marketing_admin']), previewEmailTemplate);
router.post('/templates/:id/test', requireRole(['super_admin', 'marketing_admin']), sendTestEmail);

// Email queue management (Super Admin and Finance Admin)
router.get('/queue', requireRole(['super_admin', 'finance_admin']), getEmailQueue);
router.get('/stats', requireRole(['super_admin', 'finance_admin']), getEmailStats);

// Queue processing (Super Admin only)
router.post('/queue/process', requireRole(['super_admin']), processEmailQueue);
router.post('/queue/retry', requireRole(['super_admin']), retryFailedEmails);

// Webhook endpoints (no auth required)
router.post('/webhook/:provider', handleEmailWebhook);

// Utility endpoints
router.get('/categories', requireRole(['super_admin', 'marketing_admin']), getEmailCategories);

export default router;
