/**
 * Admin restaurants (vendors) routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import { getRestaurantPayouts } from '../../controllers/admin/adminPayoutController.js';
import { resendVendorInvite } from '../../controllers/setPasswordController.js';
import multer from 'multer';
import { importMenu, downloadImportTemplate } from '../../controllers/admin/adminMenuImportController.js';
import { importRestaurants, downloadRestaurantTemplate } from '../../controllers/admin/adminRestaurantImportController.js';

// Spreadsheets are parsed in memory and never stored — the rows are the
// point, not the file.
const uploadSheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
import {
  verifyVendorContact,
  resendVendorContactVerification,
  getRestaurants,
  getRestaurantById,
  approveRestaurant,
  updateKycStatus,
  updateCommission,
  getCharges,
  updateCharges,
  updateRestaurantStatus,
  updateSettlementLock,
  updateRestaurant,
  getRestaurantOrderStats,
  getRestaurantOrders,
  getRestaurantEarnings,
  createVendor,
  updateDocumentVerification,
  updateRestaurantDocument,
  deleteRestaurant,
} from '../../controllers/admin/adminRestaurantController.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../controllers/admin/adminTaxonomyController.js';
import {
  uploadRestaurantImage,
  uploadRestaurantDocument,
  getRestaurantDocuments,
  deleteRestaurantDocument,
} from '../../controllers/admin/adminRestaurantUploadController.js';
import {
  uploadRestaurantImage as uploadImageMiddleware,
  uploadRestaurantDocument as uploadDocumentMiddleware,
  uploadVendorDocuments,
  handleUploadError,
} from '../../middleware/uploadMiddleware.js';

const router = express.Router();

// GET /api/admin/restaurants - List all restaurants with advanced filtering
router.get('/', getRestaurants);

// POST /api/admin/restaurants - Create a new vendor
router.post('/', uploadVendorDocuments, handleUploadError, createVendor);

// A fresh set-password link, when the first expired or never arrived.
router.post('/vendors/:id/resend-invite', resendVendorInvite);

// A vendor an admin created cannot trade until the email address and the
// phone number typed for them have both been confirmed.
router.post('/vendors/:id/verify-contact', verifyVendorContact);
router.post('/vendors/:id/resend-verification', resendVendorContactVerification);

/*
 * Categories must be declared before '/:id'. Express matches in order, so with
 * the id route first, GET /restaurants/categories was captured as a restaurant
 * lookup with id "categories" and rejected as a malformed ObjectId.
 */
// Declared with the other literal routes, above /:id, or 'menu' would be read
// as a restaurant id.
router.get('/menu/import-template', downloadImportTemplate);

// Adding restaurants from a spreadsheet. Declared before '/:id' so "import"
// is not read as a restaurant id.
router.get('/import-template', downloadRestaurantTemplate);
router.post('/import', uploadSheet.single('file'), importRestaurants);

router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.patch('/categories/:categoryId', updateCategory);
router.delete('/categories/:categoryId', deleteCategory);

// GET /api/admin/restaurants/:id - Get single restaurant details
router.get('/:id', getRestaurantById);

// PUT /api/admin/restaurants/:id - Update restaurant details
router.put('/:id', updateRestaurant);

// PATCH /api/admin/restaurants/:id/approve - Approve or reject restaurant
router.patch('/:id/approve', approveRestaurant);

// PATCH /api/admin/restaurants/:id/reject - Reject restaurant (alias for approve with rejected status)
router.patch('/:id/reject', approveRestaurant);

// PATCH /api/admin/restaurants/:id/kyc-status - Update KYC status
router.patch('/:id/kyc-status', updateKycStatus);

// PATCH /api/admin/restaurants/:id/commission - Update commission percentage
router.patch('/:id/commission', updateCommission);

// GET /api/admin/restaurants/:id/charges - What this restaurant is charged
router.get('/:id/charges', getCharges);

// PATCH /api/admin/restaurants/:id/charges - Set this restaurant's own terms
router.patch('/:id/charges', updateCharges);

// PATCH /api/admin/restaurants/:id/status - Enable/Disable restaurant
router.patch('/:id/status', updateRestaurantStatus);

// PATCH /api/admin/restaurants/:id/settlement-lock - Lock/Unlock settlement
router.patch('/:id/settlement-lock', updateSettlementLock);

// PATCH /api/admin/restaurants/:id/document-verification - Update document verification status
router.patch('/:id/document-verification', updateDocumentVerification);

// GET /api/admin/restaurants/:id/orders/stats - Get order statistics for a restaurant
router.get('/:id/orders', getRestaurantOrders);
router.get('/:id/orders/stats', getRestaurantOrderStats);

// GET /api/admin/restaurants/:id/earnings - Get earnings data for a restaurant
router.get('/:id/earnings', getRestaurantEarnings);

// POST /api/admin/restaurants/:id/image - Upload restaurant image
router.post('/:id/image', uploadImageMiddleware, handleUploadError, uploadRestaurantImage);

// POST /api/admin/restaurants/:id/documents/:type - Upload restaurant document
router.post('/:id/documents/:type', uploadDocumentMiddleware, handleUploadError, uploadRestaurantDocument);

// GET /api/admin/restaurants/:id/documents - Get restaurant documents info
router.get('/:id/documents', getRestaurantDocuments);

// GET /api/admin/restaurants/:id/payouts - this vendor's payout position (read only)
router.get('/:id/payouts', getRestaurantPayouts);

// PATCH /api/admin/restaurants/:id/documents/:documentType - correct the details
router.patch('/:id/documents/:documentType', updateRestaurantDocument);

// DELETE /api/admin/restaurants/:id/documents/:type - Delete restaurant document
router.delete('/:id/documents/:type', deleteRestaurantDocument);

// DELETE /api/admin/restaurants/:id - Permanently delete vendor and restaurant
router.delete('/:id', deleteRestaurant);

router.post('/:id/menu/import', uploadSheet.single('file'), importMenu);

export default router;
