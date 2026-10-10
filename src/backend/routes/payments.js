import express from 'express';
import { protect } from '../middleware/auth.js';
import paymentController from '../controllers/paymentController.js';
import paymentService from '../services/paymentService.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Payment processing
router.post('/create-order', paymentController.createPaymentOrder);
router.post('/verify', paymentController.verifyPayment);
router.post('/verify-payment', paymentController.verifyPayment);
router.post('/webhook', paymentController.processWebhook);

// Minimal order test route (for debugging)
router.get('/test-order', async (req, res) => {
  try {
    console.log('=== TEST ORDER ROUTE ===');
    console.log('Creating minimal Cashfree order for testing...');
    
    const result = await paymentService.createPaymentOrder({
      amount: 100, // 100 INR
      currency: 'INR',
      receipt: `test_${Date.now()}`,
      orderId: null,
      userId: 'test_user'
    });
    
    console.log('✅ Test order created successfully:', result);
    
    res.json({
      success: true,
      data: result.data,
      message: 'Test order created successfully'
    });
  } catch (error) {
    console.error('❌ Test order creation failed:');
    console.error('message:', error.message);
    console.error('response:', error.response?.data);
    console.error('RAW ERROR:', JSON.stringify(error, null, 2));
    
    res.json({
      success: false,
      error: {
        message: error.message,
        response: error.response?.data,
        raw: error
      }
    });
  }
});

// Wallet operations
router.post('/wallet/topup', paymentController.createWalletTopUp);
router.post('/wallet/topup/verify', paymentController.verifyWalletTopUp);
router.post('/wallet/pay', paymentController.processWalletPayment);
router.get('/wallet/balance', paymentController.getWalletBalance);
router.get('/wallet/transactions', paymentController.getWalletTransactions);
router.get('/wallet/stats', paymentController.getWalletStats);
router.get('/wallet/stats/daily', paymentController.getDailyWalletStats);

// Payment methods
router.get('/methods', paymentController.getPaymentMethods);
router.post('/validate-method', paymentController.validatePaymentMethod);

// Refunds
router.post('/refund', paymentController.processRefund);

export default router;
