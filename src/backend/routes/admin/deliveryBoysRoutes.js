/**
 * Admin Delivery Boys routes
 * All protected by adminProtect (applied in index)
 */
import express from 'express';
import {
  getDeliveryBoys,
  createDeliveryBoy,
  getDeliveryBoyById,
  updateDeliveryBoy,
  updateDeliveryBoyStatus,
  deleteDeliveryBoy,
  getDeliveryBoysByVendor,
  toggleOnlineStatus,
} from '../../controllers/admin/adminDeliveryBoyController.js';
import {
  uploadDeliveryBoyImage,
  uploadDeliveryBoyDocument,
  getDeliveryBoyDocuments,
  deleteDeliveryBoyDocument,
} from '../../controllers/admin/adminDeliveryBoyUploadController.js';
import {
  uploadDeliveryBoyImage as uploadImageMiddleware,
  uploadDeliveryBoyDocument as uploadDocumentMiddleware,
  handleUploadError,
} from '../../middleware/uploadMiddleware.js';

const router = express.Router();

// GET /api/admin/delivery-boys - List all delivery boys with filtering
router.get('/', getDeliveryBoys);

// POST /api/admin/delivery-boys/create - Create new delivery boy
router.post('/create', createDeliveryBoy);

// GET /api/admin/delivery-boys/vendor/:vendorId - Get delivery boys by vendor
router.get('/vendor/:vendorId', getDeliveryBoysByVendor);

// GET /api/admin/delivery-boys/:id - Get single delivery boy
router.get('/:id', getDeliveryBoyById);

// PUT /api/admin/delivery-boys/:id - Update delivery boy
router.put('/:id', updateDeliveryBoy);

// PATCH /api/admin/delivery-boys/:id/status - Update delivery boy status
router.patch('/:id/status', updateDeliveryBoyStatus);

// PATCH /api/admin/delivery-boys/:id/online-status - Toggle online status
router.patch('/:id/online-status', toggleOnlineStatus);

// DELETE /api/admin/delivery-boys/:id - Delete delivery boy
router.delete('/:id', deleteDeliveryBoy);

// POST /api/admin/delivery-boys/:id/image - Upload delivery boy image
router.post('/:id/image', uploadImageMiddleware, handleUploadError, uploadDeliveryBoyImage);

// POST /api/admin/delivery-boys/:id/documents/:type - Upload delivery boy document
router.post('/:id/documents/:type', uploadDocumentMiddleware, handleUploadError, uploadDeliveryBoyDocument);

// GET /api/admin/delivery-boys/:id/documents - Get delivery boy documents info
router.get('/:id/documents', getDeliveryBoyDocuments);

// DELETE /api/admin/delivery-boys/:id/documents/:type - Delete delivery boy document
router.delete('/:id/documents/:type', deleteDeliveryBoyDocument);

export default router;
