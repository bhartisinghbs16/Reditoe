import express from 'express';
import { protect, adminAuth } from '../../middleware/auth.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import bulkOperationsController from '../../controllers/admin/bulkOperationsController.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(adminProtect);

// Bulk vendor operations
router.post('/vendors/approval', bulkOperationsController.bulkVendorApproval);

// Bulk restaurant operations
router.post('/restaurants/toggle', bulkOperationsController.bulkRestaurantToggle);

// Bulk menu operations
router.post('/menu/update', bulkOperationsController.bulkMenuUpdate);

// Bulk order operations
router.post('/orders/status', bulkOperationsController.bulkOrderStatusUpdate);

// Bulk user management
router.post('/users/manage', bulkOperationsController.bulkUserManagement);

// Statistics
router.get('/stats', bulkOperationsController.getBulkOperationStats);

export default router;
