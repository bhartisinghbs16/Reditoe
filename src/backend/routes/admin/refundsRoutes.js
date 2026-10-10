/**
 * Admin refund routes. All protected by adminProtect (applied in index).
 * Complete refund workflow management for admin order control.
 */
import express from 'express';
import { requirePermission } from '../../middleware/rbac.js';
import {
  getRefunds,
  getRefundById,
  initiateRefund,
  approveRefund,
  rejectRefund,
  processRefund,
  getRefundStats,
} from '../../controllers/admin/adminRefundController.js';

const router = express.Router();

// Statistics and analytics
router.get('/stats/summary', getRefundStats);

// List and filter refunds
router.get('/', getRefunds);

// Get specific refund
router.get('/:id', getRefundById);

// Initiate new refund (admin only)
router.post('/initiate', initiateRefund);

/*
 * Approving a refund pays it out, so it is not something any member of staff
 * can do.
 *
 * Raising a refund is open to whoever handles the customer; approving it is
 * held behind 'financial:manage', which is the approval team's permission.
 * Anyone can say a refund is owed; only they can send the money.
 */
router.patch('/:id/approve', requirePermission('financial:manage'), approveRefund);

// Reject refund
router.patch('/:id/reject', requirePermission('financial:manage'), rejectRefund);

// Process refund (mark as paid)
router.patch('/:id/process', requirePermission('financial:manage'), processRefund);

export default router;
