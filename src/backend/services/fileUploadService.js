import multer from 'multer';
import path from 'path';
import cloudStorageService from './cloudStorageService.js';
import { uploadToS3 } from '../config/s3Upload.js';

class FileUploadService {
  constructor() {
    this.isInitialized = false;
    this.upload = null;
  }

  async initialize() {
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    });
    this.isInitialized = true;
  }

  generateFileName(file) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(file.originalname || '') || '.bin';
    return `${timestamp}_${randomString}${ext}`;
  }

  getSubDirectory(file) {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return 'images';
    if (mime.includes('pdf') || mime.includes('word')) return 'documents';
    return 'others';
  }

  getUploadMiddleware(field = 'file', maxFiles = 1) {
    const s3Uploader = uploadToS3('uploads');
    return maxFiles === 1 ? s3Uploader.single(field) : s3Uploader.array(field, maxFiles);
  }

  validateFileType(file, allowedTypes) {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }
  }

  validateFileSize(file, maxSize = 10 * 1024 * 1024) {
    if (file.size > maxSize) {
      throw new Error(`File size too large. Maximum size: ${maxSize / 1024 / 1024}MB`);
    }
  }

  async uploadProfileImage(file, userId, userType) {
    this.validateFileType(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
    this.validateFileSize(file, 5 * 1024 * 1024);
    const result = await cloudStorageService.uploadFile(file, 's3', {
      category: `profiles/${userType}`,
      folder: `profiles/${userType}`,
      userId,
    });
    return { success: true, fileUrl: result.publicUrl, publicUrl: result.publicUrl, secureUrl: result.publicUrl };
  }

  async uploadFoodItemImage(file, foodItemId, restaurantId) {
    this.validateFileType(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
    this.validateFileSize(file, 5 * 1024 * 1024);
    const result = await cloudStorageService.uploadFile(file, 's3', {
      category: `food-items/${restaurantId}`,
      folder: `food-items/${restaurantId}`,
      foodItemId,
    });
    return { success: true, fileUrl: result.publicUrl, publicUrl: result.publicUrl, secureUrl: result.publicUrl };
  }

  async uploadKYCDocument(file, userId, documentType, userType) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    this.validateFileType(file, allowed);
    this.validateFileSize(file, 10 * 1024 * 1024);
    const result = await cloudStorageService.uploadFile(file, 's3', {
      category: `kyc/${userType}/${documentType}`,
      folder: `kyc/${userType}/${documentType}`,
      userId,
    });
    return {
      success: true,
      fileUrl: result.publicUrl,
      publicUrl: result.publicUrl,
      secureUrl: result.publicUrl,
      documentType,
    };
  }

  async deleteFile(fileUrl) {
    if (!fileUrl) throw new Error('File URL is required');
    const base = String(process.env.AWS_S3_URL || '').replace(/\/+$/, '');
    if (base && fileUrl.startsWith(base)) {
      const key = fileUrl.slice(base.length + 1);
      await cloudStorageService.deleteFile('s3', key);
    }
    return { success: true, message: 'File deleted successfully' };
  }

  async getFileInfo(fileUrl) {
    if (!fileUrl) throw new Error('File not found');
    return { url: fileUrl };
  }

  getProfileImageMiddleware() {
    return this.getUploadMiddleware('profileImage', 1);
  }

  getFoodItemImageMiddleware() {
    return this.getUploadMiddleware('foodImage', 1);
  }

  getKYCDocumentMiddleware() {
    return this.getUploadMiddleware('kycDocument', 1);
  }

  getMultipleImagesMiddleware(maxFiles = 5) {
    return this.getUploadMiddleware('images', maxFiles);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      provider: 's3',
      uploadMiddleware: !!this.upload,
    };
  }
}

const fileUploadService = new FileUploadService();
export default fileUploadService;
