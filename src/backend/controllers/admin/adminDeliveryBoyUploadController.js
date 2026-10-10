import DeliveryBoy from '../../models/DeliveryBoy.js';
import { getFilePath, handleFileReplacement } from '../../middleware/uploadMiddleware.js';

// Upload delivery boy image
export const uploadDeliveryBoyImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate delivery boy exists
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Create upload path with delivery boy ID
    const uploadPath = `delivery-boys/${id}`;
    const filePath = getFilePath(uploadPath, req.file.filename);

    // Update delivery boy with new image path
    const updatedDeliveryBoy = await handleFileReplacement(
      DeliveryBoy,
      id,
      'image',
      filePath
    );

    res.status(200).json({
      success: true,
      message: 'Delivery boy image uploaded successfully',
      data: {
        imageUrl: filePath,
        deliveryBoy: updatedDeliveryBoy
      }
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to upload delivery boy image',
      error: error.message
    });
  }
};

// Upload delivery boy document
export const uploadDeliveryBoyDocument = async (req, res) => {
  try {
    const { id, type } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate document type
    const allowedTypes = [
      'vehicleRC',
      'license',
      'vehicleImage',
      'aadhaar',
      'pan',
      'gst',
      'fssaiLicense',
      'passbookCancelledCheque'
    ];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Allowed types: ' + allowedTypes.join(', ')
      });
    }

    // Validate delivery boy exists
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Create upload path with delivery boy ID
    const uploadPath = `delivery-boys/${id}`;
    const filePath = getFilePath(uploadPath, req.file.filename);

    // Map document type to database field
    const fieldMapping = {
      'vehicleRC': 'vehicleRC',
      'license': 'licenseImage',
      'vehicleImage': 'vehicleImage',
      'aadhaar': 'aadhaar',
      'pan': 'pan',
      'gst': 'gst',
      'fssaiLicense': 'fssaiLicense',
      'passbookCancelledCheque': 'passbookCancelledCheque'
    };

    const dbField = fieldMapping[type];
    const userDocumentFieldMapping = {
      'vehicleRC': 'vehicleRC',
      'license': 'drivingLicense',
      'vehicleImage': 'vehiclePhoto',
      'aadhaar': 'aadhaar',
      'pan': 'pan',
      'gst': 'gst',
      'fssaiLicense': 'fssaiLicense',
      'passbookCancelledCheque': 'passbookCancelledCheque'
    };
    const userDocumentField = userDocumentFieldMapping[type];

    // Update delivery boy with new document path
    await DeliveryBoy.findByIdAndUpdate(
      id,
      { [dbField]: filePath },
      { new: true, runValidators: true }
    );

    const User = (await import('../../models/User.js')).default;
    const user = await User.findById(id);
    if (user && user.role === 'rider') {
      if (!user.kycDocuments) user.kycDocuments = {};
      user.kycDocuments[userDocumentField] = filePath;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: `${type} document uploaded successfully`,
      data: {
        documentType: type,
        documentUrl: filePath
      }
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to upload delivery boy document',
      error: error.message
    });
  }
};

// Get delivery boy documents info
export const getDeliveryBoyDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const deliveryBoy = await DeliveryBoy.findById(id).select('image vehicleRC licenseImage vehicleImage');
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        image: deliveryBoy.image,
        documents: {
          vehicleRC: deliveryBoy.vehicleRC,
          license: deliveryBoy.licenseImage,
          vehicleImage: deliveryBoy.vehicleImage
        }
      }
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery boy documents',
      error: error.message
    });
  }
};

// Delete delivery boy document
export const deleteDeliveryBoyDocument = async (req, res) => {
  try {
    const { id, type } = req.params;

    // Validate document type
    const allowedTypes = ['vehicleRC', 'license', 'vehicleImage'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Allowed types: ' + allowedTypes.join(', ')
      });
    }

    // Validate delivery boy exists
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Map document type to database field
    const fieldMapping = {
      'vehicleRC': 'vehicleRC',
      'license': 'licenseImage',
      'vehicleImage': 'vehicleImage'
    };

    const dbField = fieldMapping[type];

    // Get current document path
    const currentDocPath = deliveryBoy[dbField];
    
    if (currentDocPath) {
      // Delete file from storage
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), currentDocPath);
      
      try {
        fs.unlinkSync(fullPath);
      } catch (error) {      }
    }

    // Remove document path from database
    await DeliveryBoy.findByIdAndUpdate(
      id,
      { [dbField]: '' },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: `${type} document deleted successfully`
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to delete delivery boy document',
      error: error.message
    });
  }
};
