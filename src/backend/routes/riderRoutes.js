import express from 'express';
import verification from '../controllers/verificationController.js';
import { protect } from '../middleware/auth.js';
import { riderAuth } from '../middleware/riderAuth.js';
import { getMyApplication } from '../controllers/rider/applicationController.js';
import { verifyPickup, verifyDelivery } from '../controllers/handoverController.js';
import { uploadToS3 } from '../config/s3Upload.js';
import {
  getAvailableOrders,
  getAvailableOrdersCount,
  acceptOrder,
  rejectOrder,
  getRiderOrders,
  getRiderRun,
  getAllRiderStats,
  getRiderOrderById,
  markAsDelivered,
  getRiderStats,
  toggleRiderStatus,
  updateRiderProfile,
  uploadRiderDocument,
  getRiderDocuments,
  deleteRiderDocument,
  triggerOrderBroadcast,
  getRiderLocation,
  updateRiderLocation,
  confirmCodPayment,
} from '../controllers/riderController.js';
import { getRiderProfile } from '../controllers/riderProfileController.js';
import { registerRider, uploadRiderRegistrationDocument, finalizeRiderRegistration } from '../controllers/riderRegistrationController.js';
import {
  getRiderWallet,
  getRiderEarnings,
  getRiderAnalytics,
  createWithdrawalRequest,
  getWithdrawalHistory,
  updateBankDetails,
  getBankDetails,
} from '../controllers/riderEarningsController.js';
import {
  getRiderNotifications,
  markRiderNotificationRead,
  getRiderUnreadCount,
  markAllRiderNotificationsRead,
} from '../controllers/riderNotificationController.js';
import {
  getRiderIncentives,
  claimIncentive,
} from '../controllers/riderIncentivesController.js';
import {
  createRiderSupportTicket,
  getRiderSupportTickets,
  getRiderSupportTicketById,
  addRiderTicketMessage,
} from '../controllers/riderSupportController.js';

const upload = uploadToS3('rider-documents');

const router = express.Router();

// Public rider registration routes (no authentication required)
router.post('/register', registerRider);
router.post('/register/upload-document', upload.single('document'), uploadRiderRegistrationDocument);
router.post('/register/finalize', finalizeRiderRegistration);

// All other rider routes require authentication and rider role
router.use(protect);
router.use(riderAuth);

// Rider stats
router.get('/stats', getRiderStats);

// Rider profile
router.get('/profile', getRiderProfile);
router.put('/profile', updateRiderProfile);

// Toggle online/offline status
router.patch('/status', toggleRiderStatus);

// Rider notifications
router.get('/notifications', getRiderNotifications);
router.get('/notifications/unread-count', getRiderUnreadCount);
router.patch('/notifications/mark-all-read', markAllRiderNotificationsRead);
router.patch('/notifications/:id/read', markRiderNotificationRead);

// Available orders (orders ready for pickup)
/**
 * The rider's own application. Before any approval gate, because this is what
 * an unapproved rider is shown instead of the dashboard.
 */
router.get('/application', getMyApplication);

router.get('/orders/available', getAvailableOrders);
router.get('/orders/available/count', getAvailableOrdersCount);

// Alternative route for mobile app compatibility
router.get('/available-orders', getAvailableOrders);
router.get('/available-orders/count', getAvailableOrdersCount);

// Handover verification. The rider proves the pickup at the counter and the
// delivery at the door; these are the only ways to reach OnWay and Delivered.
router.patch('/orders/:orderId/pickup-verify', verifyPickup);
router.patch('/orders/:orderId/delivery-verify', verifyDelivery);

// Trigger order broadcasting (for testing/admin use)
router.post('/orders/broadcast', triggerOrderBroadcast);

// Rider's assigned orders
router.get('/orders', getRiderOrders);

// Everything the rider is carrying, in delivery order
router.get('/run', getRiderRun);

// Rider's all order stats
router.get('/orders/stats', getAllRiderStats);

// Get order details
router.get('/orders/:orderId', getRiderOrderById);

// Accept an order
router.patch('/orders/:orderId/accept', acceptOrder);

// Reject an order
router.patch('/orders/:orderId/reject', rejectOrder);

// Mark order as delivered
router.patch('/orders/:orderId/deliver', markAsDelivered);

// Confirm COD payment collection
router.patch('/orders/:orderId/confirm-cod', confirmCodPayment);

// Wallet and Earnings Routes
// GET /api/rider/wallet - Get rider wallet information
router.get('/wallet', getRiderWallet);

// GET /api/rider/earnings - Get rider earnings history
router.get('/earnings', getRiderEarnings);

// GET /api/rider/analytics - Get rider earnings analytics
router.get('/analytics', getRiderAnalytics);

// Bank Details Routes
// GET /api/rider/bank-details - Get rider bank details
router.get('/bank-details', getBankDetails);

// PUT /api/rider/bank-details - Update rider bank details
router.put('/bank-details', updateBankDetails);

// Withdrawal Routes
// POST /api/rider/withdraw - Create withdrawal request
router.post('/withdraw', createWithdrawalRequest);

// GET /api/rider/withdrawals - Get withdrawal history
router.get('/withdrawals', getWithdrawalHistory);

// Document Upload Routes
// POST /api/rider/documents/upload - Upload rider document
// Identity verification (CGPey). Each call is billed, so the handlers
// short-circuit when a check has already passed.
router.post('/verify/pan', verification.verifyPan);
router.post('/verify/aadhaar/initiate', verification.initiateAadhaar);
router.post('/verify/aadhaar/verify', verification.verifyAadhaar);
router.post('/verify/bank', verification.verifyBank);
router.post('/verify/driving-licence', verification.verifyDrivingLicence);

router.post('/documents/upload', upload.single('document'), uploadRiderDocument);

// GET /api/rider/documents - Get rider documents
router.get('/documents', getRiderDocuments);

// DELETE /api/rider/documents/:documentType - Delete rider document
router.delete('/documents/:documentType', deleteRiderDocument);

// Rider Notifications
router.get('/notifications', getRiderNotifications);
router.get('/notifications/unread-count', getRiderUnreadCount);
router.patch('/notifications/mark-all-read', markAllRiderNotificationsRead);
router.patch('/notifications/:id/read', markRiderNotificationRead);

// Rider Incentives
router.get('/incentives', getRiderIncentives);
router.post('/incentives/:id/claim', claimIncentive);

// Rider Location
router.get('/location', getRiderLocation);
router.put('/location', updateRiderLocation);

// Rider Support Tickets
router.post('/support/tickets', createRiderSupportTicket);
router.get('/support/tickets', getRiderSupportTickets);
router.get('/support/tickets/:id', getRiderSupportTicketById);
router.post('/support/tickets/:id/message', addRiderTicketMessage);

export default router;
