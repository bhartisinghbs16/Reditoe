/**
 * Admin dispute routes. All protected by adminProtect (applied in index).
 * Complete dispute resolution system for admin order control.
 */
import express from 'express';
import {
  getDisputes,
  getDisputeById,
  createDispute,
  assignDispute,
  updateDisputeStatus,
  addDisputeMessage,
  addDisputeEvidence,
  resolveDispute,
  getDisputeStats,
} from '../../controllers/admin/adminDisputeController.js';

const router = express.Router();

// Statistics and analytics
router.get('/stats/summary', getDisputeStats);

// List and filter disputes
router.get('/', getDisputes);

// Get specific dispute
router.get('/:id', getDisputeById);

// Create new dispute (admin only)
router.post('/create', createDispute);

// Assign dispute to admin
router.patch('/:id/assign', assignDispute);

// Update dispute status
router.patch('/:id/status', updateDisputeStatus);

// Add message to dispute
router.post('/:id/messages', addDisputeMessage);

// Add evidence to dispute
router.post('/:id/evidence', addDisputeEvidence);

// Resolve dispute
router.patch('/:id/resolve', resolveDispute);

export default router;
