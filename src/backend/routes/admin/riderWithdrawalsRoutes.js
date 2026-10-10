import express from 'express';
import { protect } from '../../middleware/auth.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import {
  getWithdrawalRequests,
  getWithdrawalById,
  approveWithdrawal,
  rejectWithdrawal,
  processWithdrawal,
  getWithdrawalStats,
} from '../../controllers/admin/adminRiderWithdrawalController.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(adminProtect);

// GET /api/admin/rider-withdrawals - Get all withdrawal requests
router.get('/', getWithdrawalRequests);

// GET /api/admin/rider-withdrawals/stats - Get withdrawal statistics
router.get('/stats', getWithdrawalStats);

// GET /api/admin/rider-withdrawals/:id - Get withdrawal request by ID
router.get('/:id', getWithdrawalById);

// PATCH /api/admin/rider-withdrawals/:id/approve - Approve withdrawal request
router.patch('/:id/approve', approveWithdrawal);

// PATCH /api/admin/rider-withdrawals/:id/reject - Reject withdrawal request
router.patch('/:id/reject', rejectWithdrawal);

// PATCH /api/admin/rider-withdrawals/:id/process - Mark withdrawal as processed
router.patch('/:id/process', processWithdrawal);

export default router;
