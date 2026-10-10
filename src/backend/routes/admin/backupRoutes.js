/**
 * Backup Routes for MongoDB backup and recovery
 * All protected by rbac middleware
 */
import express from 'express';
import {
  getBackups,
  createBackup,
  triggerBackup,
  cancelBackup,
  deleteBackup,
  getBackupStats,
  downloadBackup,
  cleanupOldBackups,
  runScheduledBackups,
} from '../../controllers/admin/adminBackupController.js';
import { rbacProtect, requirePermission, requireRole } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes
router.use(rbacProtect);

// Backup management (Super Admin and Finance Admin)
router.get('/', requireRole(['super_admin', 'finance_admin']), getBackups);
router.post('/', requireRole(['super_admin', 'finance_admin']), createBackup);
router.get('/stats', requireRole(['super_admin', 'finance_admin']), getBackupStats);

// Backup operations
router.post('/:id/trigger', requireRole(['super_admin', 'finance_admin']), triggerBackup);
router.post('/:id/cancel', requireRole(['super_admin', 'finance_admin']), cancelBackup);
router.delete('/:id', requireRole(['super_admin']), deleteBackup);
router.get('/:id/download', requireRole(['super_admin', 'finance_admin']), downloadBackup);

// System operations (Super Admin only - typically called by cron jobs)
router.post('/cleanup', requireRole(['super_admin']), cleanupOldBackups);
router.post('/run-scheduled', requireRole(['super_admin']), runScheduledBackups);

export default router;
