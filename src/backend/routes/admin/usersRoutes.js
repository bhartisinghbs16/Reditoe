/**
 * Admin users routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import multer from 'multer';
import {
  adjustCustomerWallet,
  bulkCreditWallets,
  downloadWalletCreditTemplate,
} from '../../controllers/admin/adminWalletCreditController.js';
import { getCustomerAnalytics } from '../../controllers/admin/adminCustomerAnalyticsController.js';
import { 
  getUsers, 
  getUserById, 
  updateUserStatus,
  updateUser,
  updateUserMembership,
  getUserOrders, 
  markRefund 
} from '../../controllers/admin/adminUserController.js';
import {
  getCustomerGroups,
  getCustomerGroupMembers,
} from '../../controllers/admin/adminCustomerGroupController.js';

const router = express.Router();

// Spreadsheets are read in memory and thrown away; nothing is written to disk.
const uploadSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// GET /api/admin/users - List all customers with search and filters
// Before /:id, or "analytics" is read as a customer id.
router.get('/analytics', getCustomerAnalytics);

router.get('/', getUsers);

/*
 * Groups must be declared before '/:id'. Express matches in order, so with the
 * id route first, GET /users/groups was captured as a user lookup with id
 * "groups" and rejected as a malformed ObjectId.
 */
/*
 * Wallet credits. Declared before '/:id' so "wallet" is not read as a
 * customer id - the same trap the groups routes fell into.
 */
router.get('/wallet/credit-template', downloadWalletCreditTemplate);
router.post('/wallet/bulk-credit', uploadSheet.single('file'), bulkCreditWallets);

router.get('/groups', getCustomerGroups);
router.get('/groups/:groupId/members', getCustomerGroupMembers);

// GET /api/admin/users/:id - Get single user details
router.get('/:id', getUserById);

// PATCH /api/admin/users/:id - Correct a customer's name, email or phone
router.patch('/:id', updateUser);

// PATCH /api/admin/users/:id/membership - grant or withdraw Reditoe Plus
router.patch('/:id/membership', updateUserMembership);

// POST /api/admin/users/:id/wallet/adjust - add, remove, hold or unhold
router.post('/:id/wallet/adjust', adjustCustomerWallet);

// PATCH /api/admin/users/:id/status - Block/Unblock user
router.patch('/:id/status', updateUserStatus);

// GET /api/admin/users/:id/orders - Get user's order history
router.get('/:id/orders', getUserOrders);

// POST /api/admin/users/:id/refund - Mark manual refund
router.post('/:id/refund', markRefund);

export default router;
