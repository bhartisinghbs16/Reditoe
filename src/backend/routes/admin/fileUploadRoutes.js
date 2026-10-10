/**
 * File Upload Routes for cloud storage management
 * All protected by rbac middleware
 */
import express from 'express';
import {
  uploadSingleFile,
  uploadMultipleFiles,
  getUserFiles,
  getOrganizationFiles,
  getFileDetails,
  downloadFile,
  generatePresignedUrl,
  deleteFile,
  getStorageStats,
  getStorageProviders,
  cleanupExpiredFiles,
  uploadSingle,
  uploadMultiple,
} from '../../controllers/admin/adminFileUploadController.js';
import { rbacProtect, requirePermission } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes
router.use(rbacProtect);

// File upload routes
router.post('/upload/single', uploadSingle, uploadSingleFile);
router.post('/upload/multiple', uploadMultiple, uploadMultipleFiles);

// File management routes
router.get('/user', requirePermission('users:read'), getUserFiles);
router.get('/organization', requirePermission('organizations:read'), getOrganizationFiles);
router.get('/stats', requirePermission('analytics:read'), getStorageStats);
router.get('/providers', getStorageProviders);

// File operations
router.get('/:id', getFileDetails);
router.get('/:id/download', downloadFile);
router.get('/:id/presigned-url', generatePresignedUrl);
router.delete('/:id', deleteFile);

// System operations (Super Admin only)
router.post('/cleanup', requirePermission('settings:manage'), cleanupExpiredFiles);

export default router;
