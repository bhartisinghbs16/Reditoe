import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import fileUploadService from '../services/fileUploadService.js';

class FileUploadController {
  // Upload profile image
  async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const userId = req.user.id;
      const userType = req.user.role;

      // Upload image
      const result = await fileUploadService.uploadProfileImage(req.file, userId, userType);

      // Update user profile
      await User.findByIdAndUpdate(userId, {
        profileImage: result.fileUrl,
        updatedAt: new Date()
      });

      res.json({
        status: 'success',
        message: 'Profile image uploaded successfully',
        data: {
          fileUrl: result.fileUrl
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to upload profile image'
      });
    }
  }

  // Update profile image (replace existing)
  async updateProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const userId = req.user.id;
      const userType = req.user.role;

      // Get current profile image
      const user = await User.findById(userId);
      const currentProfileImage = user.profileImage;

      // Upload new image
      const result = await fileUploadService.uploadProfileImage(req.file, userId, userType);

      // Delete old image if exists
      if (currentProfileImage) {
        try {
          await fileUploadService.deleteFile(currentProfileImage);
        } catch (error) {        }
      }

      // Update user profile
      await User.findByIdAndUpdate(userId, {
        profileImage: result.fileUrl,
        updatedAt: new Date()
      });

      res.json({
        status: 'success',
        message: 'Profile image updated successfully',
        data: {
          fileUrl: result.fileUrl,
          previousImage: currentProfileImage
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update profile image'
      });
    }
  }

  // Delete profile image
  async deleteProfileImage(req, res) {
    try {
      const userId = req.user.id;

      // Get current profile image
      const user = await User.findById(userId);
      const currentProfileImage = user.profileImage;

      if (!currentProfileImage) {
        return res.status(400).json({
          status: 'error',
          message: 'No profile image to delete'
        });
      }

      // Delete image
      await fileUploadService.deleteFile(currentProfileImage);

      // Update user profile
      await User.findByIdAndUpdate(userId, {
        $unset: { profileImage: 1 },
        updatedAt: new Date()
      });

      res.json({
        status: 'success',
        message: 'Profile image deleted successfully'
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to delete profile image'
      });
    }
  }

  // Upload food item image
  async uploadFoodItemImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const { foodItemId } = req.params;
      const userId = req.user.id;

      // Verify user owns the restaurant
      const foodItem = await FoodItem.findById(foodItemId).populate('restaurantId');
      if (!foodItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Food item not found'
        });
      }

      // Check if user is vendor of this restaurant
      if (foodItem.restaurantId.ownerId.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized to upload image for this food item'
        });
      }

      // Upload image
      const result = await fileUploadService.uploadFoodItemImage(
        req.file, 
        foodItemId, 
        foodItem.restaurantId._id
      );

      // Update food item
      await FoodItem.findByIdAndUpdate(foodItemId, {
        imageUrl: result.fileUrl,
        updatedAt: new Date()
      });

      res.json({
        status: 'success',
        message: 'Food item image uploaded successfully',
        data: {
          fileUrl: result.fileUrl,
          foodItemId
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to upload food item image'
      });
    }
  }

  // Upload vendor KYC document
  async uploadVendorKYCDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const { documentType } = req.body;
      const userId = req.user.id;

      const validTypes = ['aadhaar', 'pan', 'gst', 'fssai', 'bankAccount'];
      if (!validTypes.includes(documentType)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid document type'
        });
      }

      // Upload document
      const result = await fileUploadService.uploadKYCDocument(
        req.file, 
        userId, 
        documentType, 
        'vendor'
      );

      // Update vendor KYC documents
      await User.findByIdAndUpdate(userId, {
        $set: {
          [`kycDocuments.${documentType}`]: result.fileUrl,
          kycStatus: 'pending', // Reset to pending when new document uploaded
          updatedAt: new Date()
        }
      });

      res.json({
        status: 'success',
        message: 'KYC document uploaded successfully',
        data: {
          fileUrl: result.fileUrl,
          documentType
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to upload KYC document'
      });
    }
  }

  // Upload rider KYC document
  async uploadRiderKYCDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const { documentType } = req.body;
      const userId = req.user.id;

      const validTypes = ['aadhaar', 'drivingLicense', 'vehicleRC', 'insurance', 'policeVerification'];
      if (!validTypes.includes(documentType)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid document type'
        });
      }

      // Upload document
      const result = await fileUploadService.uploadKYCDocument(
        req.file, 
        userId, 
        documentType, 
        'rider'
      );

      // Update rider KYC documents
      await User.findByIdAndUpdate(userId, {
        $set: {
          [`kycDocuments.${documentType}`]: result.fileUrl,
          kycStatus: 'pending', // Reset to pending when new document uploaded
          updatedAt: new Date()
        }
      });

      res.json({
        status: 'success',
        message: 'KYC document uploaded successfully',
        data: {
          fileUrl: result.fileUrl,
          documentType
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to upload KYC document'
      });
    }
  }

  // Get file info
  async getFileInfo(req, res) {
    try {
      const { fileUrl } = req.query;

      if (!fileUrl) {
        return res.status(400).json({
          status: 'error',
          message: 'File URL is required'
        });
      }

      const fileInfo = await fileUploadService.getFileInfo(fileUrl);

      res.json({
        status: 'success',
        data: fileInfo
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get file info'
      });
    }
  }

  // Delete file (admin only)
  async deleteFile(req, res) {
    try {
      const { fileUrl } = req.body;

      if (!fileUrl) {
        return res.status(400).json({
          status: 'error',
          message: 'File URL is required'
        });
      }

      // Only admins can delete arbitrary files
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      await fileUploadService.deleteFile(fileUrl);

      res.json({
        status: 'success',
        message: 'File deleted successfully'
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to delete file'
      });
    }
  }

  // Get upload service status
  async getUploadStatus(req, res) {
    try {
      const status = fileUploadService.getStatus();

      res.json({
        status: 'success',
        data: status
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get upload status'
      });
    }
  }

  // Upload multiple images (for food items gallery)
  async uploadMultipleImages(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No files uploaded'
        });
      }

      const { foodItemId } = req.params;
      const userId = req.user.id;

      // Verify user owns the restaurant
      const foodItem = await FoodItem.findById(foodItemId).populate('restaurantId');
      if (!foodItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Food item not found'
        });
      }

      // Check if user is vendor of this restaurant
      if (foodItem.restaurantId.ownerId.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized to upload images for this food item'
        });
      }

      // Upload all images
      const uploadPromises = req.files.map(file => 
        fileUploadService.uploadFoodItemImage(file, foodItemId, foodItem.restaurantId._id)
      );

      const results = await Promise.allSettled(uploadPromises);
      
      const successfulUploads = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value.fileUrl);

      const failedUploads = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message);

      // Update food item with gallery images
      if (successfulUploads.length > 0) {
        await FoodItem.findByIdAndUpdate(foodItemId, {
          $push: { galleryImages: { $each: successfulUploads } },
          updatedAt: new Date()
        });
      }

      res.json({
        status: 'success',
        message: `Uploaded ${successfulUploads.length} out of ${req.files.length} images`,
        data: {
          uploadedImages: successfulUploads,
          failedUploads,
          foodItemId
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to upload multiple images'
      });
    }
  }
}

export default new FileUploadController();
