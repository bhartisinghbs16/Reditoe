import { getRiderWallet, addRiderBonus } from '../../controllers/admin/adminRiderBonusController.js';
/**
 * Admin riders routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import {
  getRiderDocuments,
  updateRiderDocument,
  getRiderPayouts,
  getRiderActivity,
} from '../../controllers/admin/adminRiderFinanceController.js';
import {
  getRiders,
  getRiderById,
  verifyRiderContact,
  resendRiderContactVerification,
  getRiderOrders,
  updateRiderStatus,
  updateRiderKycStatus,
  updateRiderBankVerification,
  updateRiderBlockStatus,
  updateRiderPerKmCharge,
  addRiderIncentive,
  addRiderPenalty,
  createRider,
} from '../../controllers/admin/adminRiderController.js';
import { getRiderAnalyticsById } from '../../controllers/admin/adminRiderAnalyticsController.js';
import trackingRoutes from './ridersTrackingRoutes.js';
import analyticsRoutes from './ridersAnalyticsRoutes.js';

const router = express.Router();

// Sub-routes first (before :id to avoid /tracking and /analytics matching :id)
router.use('/tracking', trackingRoutes);
router.use('/analytics', analyticsRoutes);

// Main rider management routes
router.get('/', getRiders);
router.post('/', createRider);

// A rider an admin created stays blocked until both codes are confirmed.
router.post('/:id/verify-contact', verifyRiderContact);
router.post('/:id/resend-verification', resendRiderContactVerification);
router.get('/:id/analytics', getRiderAnalyticsById);
router.get('/:id/orders', getRiderOrders);
// Before /:id so these are not read as a partner id.
router.get('/:id/documents', getRiderDocuments);
router.patch('/:id/documents/:documentType', updateRiderDocument);
router.get('/:id/payouts', getRiderPayouts);
router.get('/:id/activity', getRiderActivity);

router.get('/:id', getRiderById);
router.patch('/:id/status', updateRiderStatus);
router.patch('/:id/kyc-status', updateRiderKycStatus);
router.patch('/:id/bank-verification', updateRiderBankVerification);
router.patch('/:id/block', updateRiderBlockStatus);
router.patch('/:id/per-km', updateRiderPerKmCharge);
router.post('/:id/incentive', addRiderIncentive);
router.post('/:id/penalty', addRiderPenalty);

// A rider's wallet, and adding a bonus to it.
router.get('/:id/wallet', getRiderWallet);
router.post('/:id/wallet/bonus', addRiderBonus);

export default router;
