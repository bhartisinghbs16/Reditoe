import express from 'express';
import {
  getVendorWithdrawalRequests,
  approveVendorWithdrawal,
  rejectVendorWithdrawal,
  processVendorWithdrawal,
} from '../../controllers/admin/adminVendorWithdrawalController.js';

const router = express.Router();

router.get('/', getVendorWithdrawalRequests);
router.patch('/:id/approve', approveVendorWithdrawal);
router.patch('/:id/reject', rejectVendorWithdrawal);
router.patch('/:id/process', processVendorWithdrawal);

export default router;

