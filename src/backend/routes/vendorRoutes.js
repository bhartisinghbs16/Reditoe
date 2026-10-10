import express from 'express';
import multer from 'multer';
import Restaurant from '../models/Restaurant.js';
import {
  importMenu,
  downloadImportTemplate,
} from '../controllers/admin/adminMenuImportController.js';

/** Spreadsheets are read in memory and thrown away; nothing is written to disk. */
const uploadSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
import { uploadToS3 } from '../config/s3Upload.js';
import { 
  getVendorStats, 
  getVendorRestaurant, 
  updateVendorRestaurantAvailability,
  updateRestaurant,
  uploadVendorRestaurantLogo,
  createVendorRestaurant,
  updateVendorProfile, 
  getVendorOrders, 
  updateOrderStatus,
  getOrderById,
  getVendorMenu,
  addFoodItem,
  updateFoodItem,
  deleteFoodItem,
  uploadMenuItemImage,
  sendVendorOTP,
  verifyVendorOTP,
  uploadVendorDocument,
  getVendorDocuments,
  downloadOrderInvoice,
  testPDFGeneration,
} from '../controllers/vendorController.js';
import { 
  uploadKycDocument, 
  getKycStatus, 
  deleteKycDocument 
} from '../controllers/vendorKycController.js';
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  toggleCategory,
} from '../controllers/vendor/categoryController.js';
import {
  getVendorCombos,
  createCombo,
  updateCombo,
  deleteCombo
} from '../controllers/vendor/comboController.js';
import { registerVendor } from '../controllers/user/authController.js';
import { protect } from '../middleware/auth.js';
import { vendorAuth } from '../middleware/vendorAuth.js';
import { requireApprovedVendor } from '../middleware/requireApprovedVendor.js';
import {
  getMyApplication,
  resubmitApplication,
} from '../controllers/vendor/applicationController.js';
import { getVendorPickupCode } from '../controllers/handoverController.js';
import deliveryBoysRoutes from './vendor/deliveryBoysRoutes.js';
import vendorCouponRoutes from './vendor/vendorCouponRoutes.js';
import { getVendorWithdrawalSummary, createVendorWithdrawalRequest, getVendorWithdrawals, processVendorPayout } from '../controllers/vendorWithdrawalController.js';
import verification from '../controllers/verificationController.js';

const upload = uploadToS3('vendor-documents');

const router = express.Router();

router.post('/register', registerVendor);

router.post('/send-otp', sendVendorOTP);

// POST /api/vendor/verify-otp - Verify OTP and login
router.post('/verify-otp', verifyVendorOTP);

// All other vendor routes require authentication and vendor role
// GET /api/vendor/stats - Get vendor dashboard stats
// Note: Only requires 'protect' middleware, not 'vendorAuth', to allow new vendors without restaurants
router.get('/stats', protect, getVendorStats);

// GET /api/vendor/restaurant - Get vendor restaurant details
router.get('/restaurant', protect, vendorAuth, getVendorRestaurant);

// PATCH /api/vendor/restaurant/availability - Toggle online/offline availability
router.patch('/restaurant/availability', protect, vendorAuth, updateVendorRestaurantAvailability);

// PATCH /api/vendor/restaurant - Update restaurant settings
router.patch('/restaurant', protect, vendorAuth, updateRestaurant);

// POST /api/vendor/restaurant - Create restaurant for vendor
router.post('/restaurant', protect, createVendorRestaurant);

// POST /api/vendor/restaurant/logo - Upload restaurant logo
router.post('/restaurant/logo', protect, upload.single('image'), uploadVendorRestaurantLogo);

// PUT /api/vendor/profile - Update vendor profile
router.put('/profile', protect, vendorAuth, updateVendorProfile);

/**
 * The vendor's own application. Deliberately before the approval gate: this is
 * what an unapproved vendor is shown instead of the dashboard, so it has to
 * work while they are unapproved.
 */
router.get('/application', protect, vendorAuth, getMyApplication);
router.post('/application/resubmit', protect, vendorAuth, resubmitApplication);

/**
 * KYC documents, before the approval gate on purpose.
 *
 * Uploading them is what an unapproved vendor is *for* — putting these behind
 * approval meant a pending vendor could not supply the very documents their
 * approval depends on.
 */
router.post('/kyc/upload', protect, vendorAuth, upload.single('document'), uploadKycDocument);

/*
 * The vendor's own menu import, and the template that goes with it.
 *
 * The admin console has had both for a while; the vendor app's "Excel Upload"
 * button had nothing behind it. The importer identifies the restaurant from
 * the route, so the vendor's own restaurant is put there for them - a vendor
 * must not be able to import a menu into somebody else's kitchen by changing
 * an id.
 */
const ownRestaurant = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user?.id || req.user?._id })
      .select('_id')
      .lean();
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }
    req.params.id = String(restaurant._id);
    return next();
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

router.get('/menu/import-template', protect, vendorAuth, downloadImportTemplate);
router.post(
  '/menu/import',
  protect,
  vendorAuth,
  ownRestaurant,
  uploadSheet.single('file'),
  importMenu
);
router.get('/kyc/status', protect, vendorAuth, getKycStatus);
router.delete('/kyc/:documentType', protect, vendorAuth, deleteKycDocument);

/**
 * Everything past here is running a restaurant, which needs approval. Orders,
 * menu, categories, combos, payouts — an unapproved vendor gets the reason
 * instead, and the console draws its status screen from that.
 */
router.use(protect, vendorAuth, requireApprovedVendor);

// GET /api/vendor/orders - Get vendor orders (with optional status filter)
router.get('/orders', protect, vendorAuth, getVendorOrders);

// GET /api/vendor/orders/:orderId/invoice - Download order invoice PDF
router.get('/orders/:orderId/invoice', protect, vendorAuth, downloadOrderInvoice);

// GET /api/vendor/orders/:orderId/pickup-code - the code/QR the rider verifies
router.get('/orders/:orderId/pickup-code', protect, vendorAuth, getVendorPickupCode);

// PATCH /api/vendor/orders/:orderId/status - Update order status (state machine)
router.patch('/orders/:orderId/status', protect, vendorAuth, updateOrderStatus);

// GET /api/vendor/orders/:id - Get order by ID with bill summary
router.get('/orders/:id', protect, vendorAuth, getOrderById);

// GET /api/vendor/test-pdf - Test PDF generation
router.get('/test-pdf', protect, vendorAuth, testPDFGeneration);

// Menu Management Routes
// GET /api/vendor/menu - Get vendor's menu (all food items)
router.get('/menu', protect, vendorAuth, getVendorMenu);

// POST /api/vendor/menu - Add new food item
router.post('/menu', protect, vendorAuth, addFoodItem);

// POST /api/vendor/menu/upload-image - Upload food item image
router.post('/menu/upload-image', protect, vendorAuth, upload.single('image'), uploadMenuItemImage);

// PATCH /api/vendor/menu/:id - Update food item (price, availability, etc.)
router.patch('/menu/:id', protect, vendorAuth, updateFoodItem);

// DELETE /api/vendor/menu/:id - Delete food item
router.delete('/menu/:id', protect, vendorAuth, deleteFoodItem);

// Category Management Routes
router.get('/categories', protect, vendorAuth, getCategories);
router.post('/categories', protect, vendorAuth, addCategory);
router.patch('/categories/:categoryId', protect, vendorAuth, updateCategory);
router.delete('/categories/:categoryId', protect, vendorAuth, deleteCategory);
router.patch('/categories/:categoryId/toggle', protect, vendorAuth, toggleCategory);

// Combo Routes
router.get('/combos', protect, vendorAuth, getVendorCombos);
router.post('/combos', protect, vendorAuth, createCombo);
router.patch('/combos/:id', protect, vendorAuth, updateCombo);
router.delete('/combos/:id', protect, vendorAuth, deleteCombo);

// Coupon Management Routes
router.use('/coupons', protect, vendorAuth, vendorCouponRoutes);

// Delivery Boy Management Routes
router.use('/delivery-boys', protect, vendorAuth, deliveryBoysRoutes);

// Document Management Routes
// POST /api/vendor/upload-document - Upload vendor document (legacy)
router.post('/upload-document', protect, vendorAuth, upload.single('document'), uploadVendorDocument);

// GET /api/vendor/documents - Get vendor documents (legacy)
router.get('/documents', protect, vendorAuth, getVendorDocuments);


// Identity verification (CGPey), for the business rather than the person:
// GST belongs to the restaurant, PAN and bank to the account behind it.
router.post('/verify/pan', protect, vendorAuth, verification.verifyPan);
router.post('/verify/gst', protect, vendorAuth, verification.verifyGst);
router.post('/verify/bank', protect, vendorAuth, verification.verifyBank);



// Vendor withdrawal routes
router.get('/withdrawals/summary', protect, vendorAuth, getVendorWithdrawalSummary);
router.post('/withdrawals/process-payout', protect, vendorAuth, processVendorPayout);
router.post('/withdrawals', protect, vendorAuth, createVendorWithdrawalRequest);
router.get('/withdrawals', protect, vendorAuth, getVendorWithdrawals);

export default router;
