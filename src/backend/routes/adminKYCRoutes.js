import express from 'express';
import {
  getKycApplications,
  getKycApplicationDetails,
  approveKycApplication,
  rejectKycApplication,
  verifyDocument,
  getKycStats,
  downloadKycDocument,
} from '../controllers/adminKYCController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get all KYC applications with filtering and pagination
router.get('/applications', getKycApplications);

// Get KYC statistics
router.get('/stats', getKycStats);

// Get specific KYC application details
router.get('/:id', getKycApplicationDetails);

// Approve KYC application
router.post('/:id/approve', approveKycApplication);

// Reject KYC application
router.post('/:id/reject', rejectKycApplication);

// Verify individual document
router.post('/:id/documents/:documentType/verify', verifyDocument);

// Download document info
router.get('/:id/documents/:documentType/download', downloadKycDocument);

export default router;
