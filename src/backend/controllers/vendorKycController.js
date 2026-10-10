/**
 * Enhanced Vendor KYC Controller
 * Completes the KYC document system with proper validation and status tracking
 */
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import FileUpload from '../models/FileUpload.js';
import VendorKYC from '../models/VendorKYC.js';
import cloudStorageService from '../services/cloudStorageService.js';
import mongoose from 'mongoose';

/**
 * Upload KYC document - POST /api/vendor/kyc/upload
 */
export const uploadKycDocument = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { documentType } = req.body;

    // Validate document type
    const allowedDocumentTypes = [
      'aadhaar',
      'pan',
      'gst',
      'fssai',
      'cancelledCheque',
      'drivingLicense',
      'vehicleRC',
      'selfie',
      'shop',
      'restaurantPhoto',
      'menu',
    ];

    if (!documentType || !allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: `Document type must be one of: ${allowedDocumentTypes.join(', ')}`,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded',
      });
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: 'error',
        message: 'Only PDF, JPG, and PNG files are allowed',
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        status: 'error',
        message: 'File size must be less than 5MB',
      });
    }

    // Find vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Upload file to cloud storage
    let uploadResult;

    if (req.file?.location) {
      // S3 multer upload succeeded
      uploadResult = {
        provider: 's3',
        filename: req.file.key || req.file.originalname,
        storagePath: req.file.key || '',
        publicUrl: req.file.location,
        secureUrl: req.file.location,
      };
    } else {
      // S3 multer failed — ensure buffer exists for fallback
      if (!req.file.buffer && req.file.path) {
        const fs = await import('fs');
        req.file.buffer = fs.readFileSync(req.file.path);
      }

      if (!req.file.buffer) {
        return res.status(500).json({
          status: 'error',
          message: 'File upload failed: file data missing. Please try again.',
        });
      }

      uploadResult = await cloudStorageService.uploadFile(
        req.file,
        'local',
        {
          category: 'kyc-documents',
          userId: userId,
        }
      );
    }

    // Create file record
    const fileRecord = new FileUpload({
      originalName: req.file.originalname,
      filename: uploadResult.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      provider: uploadResult.provider,
      storagePath: uploadResult.storagePath,
      publicUrl: uploadResult.publicUrl,
      secureUrl: uploadResult.secureUrl,
      category: 'kyc-documents',
      uploadedBy: userId,
      isPublic: false,
    });

    await fileRecord.save();

    // Update restaurant KYC documents
    if (!restaurant.kycDocuments) {
      restaurant.kycDocuments = {};
    }

    restaurant.kycDocuments[documentType] = uploadResult.publicUrl;

    /*
     * A restaurant photo is a picture of the place, not paperwork.
     *
     * Filing it only under kycDocuments meant one photo, kept with the
     * licences, that no listing and no admin screen ever showed. It also
     * goes into the restaurant's own gallery now, and becomes the listing
     * picture when there is not one yet - so a vendor can add several during
     * onboarding and see them where customers will.
     */
    if (documentType === 'restaurantPhoto') {
      if (!Array.isArray(restaurant.images)) restaurant.images = [];
      if (!restaurant.images.includes(uploadResult.publicUrl)) {
        restaurant.images.push(uploadResult.publicUrl);
      }
      if (!restaurant.image) restaurant.image = uploadResult.publicUrl;
    }

    // Update KYC status based on required documents
    const requiredDocuments = ['aadhaar', 'pan', 'fssai', 'cancelledCheque'];
    const uploadedDocuments = Object.keys(restaurant.kycDocuments).filter(
      key => restaurant.kycDocuments[key] && requiredDocuments.includes(key)
    );

    // If all required documents are uploaded, set KYC status to under_review
    if (uploadedDocuments.length === requiredDocuments.length && restaurant.kycStatus === 'pending') {
      restaurant.kycStatus = 'under_review';
    }

    await restaurant.save();

    res.status(201).json({
      status: 'success',
      message: `${documentType} document uploaded successfully`,
      data: {
        document: {
          id: fileRecord._id,
          type: documentType,
          url: uploadResult.publicUrl,
          originalName: req.file.originalname,
        },
        kycStatus: restaurant.kycStatus,
        uploadedDocuments: Object.keys(restaurant.kycDocuments).filter(key => restaurant.kycDocuments[key]),
        requiredDocuments,
      },
    });
  } catch (error) {    console.error('KYC upload error:', error?.message, error?.stack);    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload document',
    });
  }
};

/**
 * Get KYC status and documents - GET /api/vendor/kyc/status
 */
export const getKycStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    // Find vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    const requiredDocuments = ['aadhaar', 'pan', 'fssai', 'cancelledCheque'];
    const uploadedDocuments = Object.keys(restaurant.kycDocuments || {}).filter(
      key => restaurant.kycDocuments[key]
    );

    const isComplete = uploadedDocuments.length === requiredDocuments.length;

    res.status(200).json({
      status: 'success',
      data: {
        kycStatus: restaurant.kycStatus,
        isComplete,
        uploadedDocuments,
        requiredDocuments,
        documents: restaurant.kycDocuments || {},
        documentVerificationStatus: restaurant.documentVerificationStatus || {
          fssaiVerified: false,
          gstVerified: false,
          bankVerified: false,
        },
      },
    });
  } catch (error) {    console.error('KYC upload error:', error?.message, error?.stack);    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch KYC status',
    });
  }
};

/**
 * Delete KYC document - DELETE /api/vendor/kyc/:documentType
 */
export const deleteKycDocument = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { documentType } = req.params;

    const allowedDocumentTypes = [
      'aadhaar',
      'pan',
      'gst',
      'fssai',
      'cancelledCheque',
      'drivingLicense',
      'vehicleRC',
      'selfie'
    ];

    if (!documentType || !allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: `Document type must be one of: ${allowedDocumentTypes.join(', ')}`,
      });
    }

    // Find vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Check if document exists
    if (!restaurant.kycDocuments || !restaurant.kycDocuments[documentType]) {
      return res.status(404).json({
        status: 'error',
        message: `${documentType} document not found`,
      });
    }

    // Delete document URL from restaurant
    delete restaurant.kycDocuments[documentType];

    // Reset KYC status if documents are incomplete
    const requiredDocuments = ['aadhaar', 'pan', 'fssai', 'cancelledCheque'];
    const uploadedDocuments = Object.keys(restaurant.kycDocuments).filter(
      key => restaurant.kycDocuments[key] && requiredDocuments.includes(key)
    );

    if (uploadedDocuments.length < requiredDocuments.length) {
      restaurant.kycStatus = 'pending';
    }

    await restaurant.save();

    res.status(200).json({
      status: 'success',
      message: `${documentType} document deleted successfully`,
      data: {
        kycStatus: restaurant.kycStatus,
        uploadedDocuments: Object.keys(restaurant.kycDocuments).filter(key => restaurant.kycDocuments[key]),
        requiredDocuments,
      },
    });
  } catch (error) {    console.error('KYC upload error:', error?.message, error?.stack);    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete document',
    });
  }
};

export default {
  uploadKycDocument,
  getKycStatus,
  deleteKycDocument,
};


