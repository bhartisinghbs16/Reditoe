/**
 * Admin Payment Routes
 * Handles all payment gateway, settlement, and financial reporting routes
 */
import express from 'express';
import {
  getPaymentGateways,
  createPaymentGateway,
  updatePaymentGateway,
  deletePaymentGateway,
  testPaymentGateway,
  getSettlementRules,
  createSettlementRule,
  updateSettlementRule,
  createManualAdjustment,
  getProfitDashboard,
  getGstReport,
  getRefunds,
  getCommissionReports,
  getWalletBalances,
  getSettlementHistory,
  processBulkPayouts,
} from '../../controllers/admin/adminPaymentController.js';
import { adminProtect } from '../../middleware/adminAuth.js';

import {
  getTransactions,
  getTransactionSummary,
  getWallets,
} from '../../controllers/admin/adminTransactionsController.js';

const router = express.Router();

// All payment routes require admin authentication
router.use(adminProtect);

// GET /api/admin/payments - the transaction ledger
router.get('/', getTransactions);

// GET /api/admin/payments/summary - inflow / outflow / net for the range
router.get('/summary', getTransactionSummary);

// GET /api/admin/payments/wallets - customer and rider balances, normalised
router.get('/wallets', getWallets);

// Payment Gateway Configuration Routes
router.route('/gateways')
  .get(getPaymentGateways)
  .post(createPaymentGateway);

router.route('/gateways/:id')
  .patch(updatePaymentGateway)
  .delete(deletePaymentGateway);

router.post('/gateways/:id/test', testPaymentGateway);

// Settlement Rules Routes
router.route('/settlements')
  .get(getSettlementRules)
  .post(createSettlementRule);

router.patch('/settlements/:id', updateSettlementRule);
router.post('/settlements/manual-adjustment', createManualAdjustment);

// Financial Reporting Routes
router.get('/profit-dashboard', getProfitDashboard);
router.get('/gst-report', getGstReport);
router.get('/refunds', getRefunds);
router.get('/commission-reports', getCommissionReports);
router.get('/wallet-balances', getWalletBalances);
router.get('/settlement-history', getSettlementHistory);

// Payout Processing Routes
router.post('/bulk-payout', processBulkPayouts);

export default router;
