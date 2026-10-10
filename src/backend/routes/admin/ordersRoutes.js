/**
 * Admin orders routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import { getOrderAnalytics } from '../../controllers/admin/adminOrderAnalyticsController.js';
import { getOrderTracking, getOrderConversation } from '../../controllers/admin/adminOrderTrackingController.js';
import {
  getOrders,
  getOrderById,
  updateOrderStatus,
  assignRiderToOrder,
  getLiveOrders,
  cancelOrder,
  markRefund,
  resolveDispute,
  updateAdminNotes,
} from '../../controllers/admin/adminOrderController.js';

const router = express.Router();

// Specific routes before :id
router.get('/', getOrders);
router.get('/live', getLiveOrders);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/assign-rider', assignRiderToOrder);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/refund', markRefund);
router.patch('/:id/dispute', resolveDispute);
router.patch('/:id/admin-notes', updateAdminNotes);
// Before nothing, but kept next to its sibling: the journey this order took.
/*
 * Declared before '/:id' so "analytics" is not read as an order id - the same
 * trap the groups route fell into on customers.
 */
router.get('/analytics', getOrderAnalytics);

router.get('/:id/tracking', getOrderTracking);

// What the customer and their delivery partner said to each other.
router.get('/:id/chat', getOrderConversation);
router.get('/:id', getOrderById);

export default router;
