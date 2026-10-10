import express from 'express';
import { protect } from '../middleware/auth.js';
import fileUploadController from '../controllers/fileUploadController.js';
import fileUploadService from '../services/fileUploadService.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Initialize file upload service
router.use(async (req, res, next) => {
  if (!fileUploadService.isInitialized) {
    await fileUploadService.initialize();
  }
  next();
});

// Profile image routes
router.post('/profile-image', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getProfileImageMiddleware()(req, res, next);
  },
  fileUploadController.uploadProfileImage
);

router.put('/profile-image', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getProfileImageMiddleware()(req, res, next);
  },
  fileUploadController.updateProfileImage
);

router.delete('/profile-image', fileUploadController.deleteProfileImage);

// Food item image routes
router.post('/food-item/:foodItemId/image', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getFoodItemImageMiddleware()(req, res, next);
  },
  fileUploadController.uploadFoodItemImage
);

router.post('/food-item/:foodItemId/images', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getMultipleImagesMiddleware(5)(req, res, next);
  },
  fileUploadController.uploadMultipleImages
);

// KYC document routes
router.post('/vendor/kyc', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getKYCDocumentMiddleware()(req, res, next);
  },
  fileUploadController.uploadVendorKYCDocument
);

router.post('/rider/kyc', 
  async (req, res, next) => {
    if (!fileUploadService.isInitialized) {
      await fileUploadService.initialize();
    }
    fileUploadService.getKYCDocumentMiddleware()(req, res, next);
  },
  fileUploadController.uploadRiderKYCDocument
);

// File management routes
router.get('/info', fileUploadController.getFileInfo);
router.delete('/file', fileUploadController.deleteFile); // Admin only
router.get('/status', fileUploadController.getUploadStatus);

export default router;
