import Restaurant from '../../models/Restaurant.js';
import { getFilePath, handleFileReplacement } from '../../middleware/uploadMiddleware.js';
import cloudStorageService from '../../services/cloudStorageService.js';
import {
  DOCUMENT_TYPES,
  deriveKycStatus,
  resolveDocumentType,
} from '../../utils/restaurantDocuments.js';

// Upload restaurant image
export const uploadRestaurantImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Create upload path with restaurant ID
    const uploadPath = `restaurants/${id}`;
    const filePath = getFilePath(uploadPath, req.file.filename);

    // Update restaurant with new image path
    const updatedRestaurant = await handleFileReplacement(
      Restaurant,
      id,
      'image',
      filePath
    );

    res.status(200).json({
      success: true,
      message: 'Restaurant image uploaded successfully',
      data: {
        imageUrl: filePath,
        restaurant: updatedRestaurant
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload restaurant image',
      error: error.message
    });
  }
};

// Upload restaurant document
export const uploadRestaurantDocument = async (req, res) => {
  try {
    const { id, type } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Accepts the canonical names and the older ones alike.
    const documentType = resolveDocumentType(type);
    if (!documentType) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid document type. Allowed types: ' +
          DOCUMENT_TYPES.map((entry) => entry.key).join(', '),
      });
    }

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const uploadResult = await cloudStorageService.uploadFile(req.file, 's3', {
      category: `restaurants/${id}/documents`,
      folder: `restaurants/${id}/documents`,
    });
    const fullFilePath = uploadResult.publicUrl;

    const { number, expiryDate } = req.body ?? {};

    /**
     * A fresh file starts the document over at pending, and drops any previous
     * rejection with it — re-uploading is how a vendor answers a rejection, so
     * carrying the old verdict forward would make that impossible.
     */
    if (!restaurant.documentRecords) restaurant.documentRecords = new Map();
    const previous = restaurant.documentRecords.get(documentType.key);
    restaurant.documentRecords.set(documentType.key, {
      url: fullFilePath,
      number: number?.trim() || previous?.number,
      uploadedAt: new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : previous?.expiryDate,
      status: 'pending',
      verifiedBy: undefined,
      verifiedAt: undefined,
      note: undefined,
    });

    // The older fields other screens and the vendor apps still read.
    if (documentType.legacy) {
      restaurant.set(`kycDocuments.${documentType.legacy}`, fullFilePath);
    }
    if (documentType.flag) {
      restaurant.set(`documentVerificationStatus.${documentType.flag}`, false);
    }

    restaurant.kycStatus = deriveKycStatus(restaurant.documentRecords);
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `${documentType.label} uploaded successfully`,
      data: {
        documentType: documentType.key,
        documentUrl: fullFilePath,
        kycStatus: restaurant.kycStatus,
        document: restaurant.documentRecords.get(documentType.key),
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload restaurant document',
      error: error.message
    });
  }
};

// Get restaurant documents info
export const getRestaurantDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id).select('kycDocuments image');
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        image: restaurant.image,
        documents: restaurant.kycDocuments
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant documents',
      error: error.message
    });
  }
};

// Delete restaurant document
export const deleteRestaurantDocument = async (req, res) => {
  try {
    const { id, type } = req.params;

    // Validate document type
    const allowedTypes = ['foodLicense', 'gst', 'aadhaar', 'pan', 'cancelledCheque'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Allowed types: ' + allowedTypes.join(', ')
      });
    }

    // Validate restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Map document type to database field
    const fieldMapping = {
      'foodLicense': 'kycDocuments.fssai',
      'gst': 'kycDocuments.gst',
      'aadhaar': 'kycDocuments.aadhaar',
      'pan': 'kycDocuments.pan',
      'cancelledCheque': 'kycDocuments.cancelledCheque'
    };

    const dbField = fieldMapping[type];

    // Get current document path
    const currentDocPath = restaurant.get(dbField);
    
    if (currentDocPath) {
      // Delete file from storage
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), currentDocPath);
      
      try {
        fs.unlinkSync(fullPath);
      } catch (error) {
      }
    }

    // Remove document path from database
    await Restaurant.findByIdAndUpdate(
      id,
      { [dbField]: '' },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: `${type} document deleted successfully`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete restaurant document',
      error: error.message
    });
  }
};
