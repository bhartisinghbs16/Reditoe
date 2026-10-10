import express from 'express';
import { getOrderChat, sendOrderChatMessage } from '../controllers/orderChatController.js';
import {
  createOrder,
  getMyOrders,
  processRefund,
  getRefundHistory,
  previewOrderPricing,
  cancelOrder,
  abandonPendingOrder,
} from '../controllers/user/orderController.js';
import locationController from '../controllers/locationController.js';
import { validateCoupon, getAvailableCoupons } from '../controllers/user/couponController.js';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  createWalletTopUp,
  verifyWalletTopUp,
} from '../controllers/user/razorpayController.js';
import { protect } from '../middleware/auth.js';
import { getCustomerDeliveryCode } from '../controllers/handoverController.js';
import { adminProtect } from '../middleware/adminAuth.js';
import orderCommunicationRoutes from './orderCommunicationRoutes.js';

const router = express.Router();

router.post('/create', protect, createOrder);
router.post('/pricing-preview', protect, previewOrderPricing);
router.get('/my-orders', protect, getMyOrders);
router.get('/coupons', getAvailableCoupons);
router.post('/coupons/validate', protect, validateCoupon);
/**
 * The customer and their delivery partner, talking about one order.
 *
 * Mounted here rather than under /rider or /user because both sides use the
 * same two endpoints: which of them is asking is worked out from the order
 * itself, not from which door they came through.
 */
router.get('/:orderId/chat', protect, getOrderChat);
router.post('/:orderId/chat', protect, sendOrderChatMessage);

router.post('/razorpay/create-order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);

// Wallet top-up, on the same gateway. The platform's other top-up route is
// built on Cashfree, which this deployment has no keys for.
router.post('/razorpay/wallet-topup', protect, createWalletTopUp);
router.post('/razorpay/wallet-topup/verify', protect, verifyWalletTopUp);
router.get('/:orderId/tracking', protect, locationController.getOrderTracking);
// The code the customer shows the rider at the door.
router.get('/:orderId/delivery-code', protect, getCustomerDeliveryCode);
router.patch('/:orderId/status', protect, cancelOrder);

// Withdraw an order whose online payment never completed. Removes the row
// rather than cancelling it: nobody placed this order.
router.delete('/:orderId/pending', protect, abandonPendingOrder);
router.post('/:orderId/refund', adminProtect, processRefund);
router.get('/:orderId/refunds', adminProtect, getRefundHistory);
router.use('/:orderId/communication', orderCommunicationRoutes);

export default router;
