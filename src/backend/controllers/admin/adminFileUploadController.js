/**
 * File Upload Controller for cloud storage management
 * Additive only - does not modify existing functionality
 */
import multer from 'multer';
import FileUpload from '../../models/FileUpload.js';
import cloudStorageService from '../../services/cloudStorageService.js';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  }
});

/**
 * Upload single file
 */
export const uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const { category = 'other', provider = 'local', isPublic = false } = req.body;
    
    // Validate file
    const validationErrors = cloudStorageService.validateFile(req.file, {
      maxSize: 50 * 1024 * 1024,
      allowedTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'File validation failed',
        errors: validationErrors
      });
    }

    // Upload to cloud storage
    const uploadResult = await cloudStorageService.uploadFile(req.file, provider, {
      category,
      userId: req.user._id
    });

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
      category,
      uploadedBy: req.user._id,
      organizationId: req.user.organizationId || null,
      isPublic: isPublic === 'true' || isPublic === true
    });

    await fileRecord.save();

    res.status(201).json({
      status: 'success',
      data: {
        file: fileRecord
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error uploading file',
      error: error.message
    });
  }
};

/**
 * Upload multiple files
 */
export const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files uploaded'
      });
    }

    const { category = 'other', provider = 'local', isPublic = false } = req.body;
    const uploadedFiles = [];
    const errors = [];

    // Process each file
    for (const file of req.files) {
      try {
        // Validate file
        const validationErrors = cloudStorageService.validateFile(file, {
          maxSize: 50 * 1024 * 1024,
          allowedTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ]
        });

        if (validationErrors.length > 0) {
          errors.push({
            filename: file.originalname,
            errors: validationErrors
          });
          continue;
        }

        // Upload to cloud storage
        const uploadResult = await cloudStorageService.uploadFile(file, provider, {
          category,
          userId: req.user._id
        });

        // Create file record
        const fileRecord = new FileUpload({
          originalName: file.originalname,
          filename: uploadResult.filename,
          mimetype: file.mimetype,
          size: file.size,
          provider: uploadResult.provider,
          storagePath: uploadResult.storagePath,
          publicUrl: uploadResult.publicUrl,
          secureUrl: uploadResult.secureUrl,
          category,
          uploadedBy: req.user._id,
          organizationId: req.user.organizationId || null,
          isPublic: isPublic === 'true' || isPublic === true
        });

        await fileRecord.save();
        uploadedFiles.push(fileRecord);
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.status(201).json({
      status: 'success',
      data: {
        files: uploadedFiles,
        uploaded: uploadedFiles.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error uploading files',
      error: error.message
    });
  }
};

/**
 * Get user's uploaded files
 */
export const getUserFiles = async (req, res) => {
  try {
    const { page = 1, limit = 20, category } = req.query;
    
    const files = await FileUpload.findByUser(req.user._id, {
      category,
      organizationId: req.user.organizationId,
      limit: parseInt(limit)
    });

    const total = await FileUpload.countDocuments({
      uploadedBy: req.user._id,
      isDeleted: false,
      ...(category && { category }),
      ...(req.user.organizationId && { organizationId: req.user.organizationId })
    });

    res.status(200).json({
      status: 'success',
      data: {
        files,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching files',
      error: error.message
    });
  }
};

/**
 * Get organization files
 */
export const getOrganizationFiles = async (req, res) => {
  try {
    const { page = 1, limit = 20, category } = req.query;
    
    if (!req.user.organizationId) {
      return res.status(403).json({
        status: 'error',
        message: 'Organization access required'
      });
    }

    const files = await FileUpload.findByOrganization(req.user.organizationId, {
      category,
      limit: parseInt(limit)
    });

    const total = await FileUpload.countDocuments({
      organizationId: req.user.organizationId,
      isDeleted: false,
      ...(category && { category })
    });

    res.status(200).json({
      status: 'success',
      data: {
        files,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching organization files',
      error: error.message
    });
  }
};

/**
 * Get file details
 */
export const getFileDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await FileUpload.findOne({
      _id: id,
      isDeleted: false
    }).populate('uploadedBy', 'name email');

    if (!file) {
      return res.status(404).json({
        status: 'error',
        message: 'File not found'
      });
    }

    // Check access permissions
    if (!file.canUserAccess(req.user._id, 'view')) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        file
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching file details',
      error: error.message
    });
  }
};

/**
 * Download file
 */
export const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await FileUpload.findOne({
      _id: id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({
        status: 'error',
        message: 'File not found'
      });
    }

    // Check access permissions
    if (!file.canUserAccess(req.user._id, 'download')) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Get file from storage
    const fileData = await cloudStorageService.getFile(file.provider, file.storagePath);
    
    // Increment download count
    await file.incrementDownload();

    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', fileData.size);

    // Send file
    res.send(fileData.buffer);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error downloading file',
      error: error.message
    });
  }
};

/**
 * Generate presigned URL
 */
export const generatePresignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = 3600 } = req.query;
    
    const file = await FileUpload.findOne({
      _id: id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({
        status: 'error',
        message: 'File not found'
      });
    }

    // Check access permissions
    if (!file.canUserAccess(req.user._id, 'view')) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Generate presigned URL
    const presignedUrl = await file.generatePresignedUrl(parseInt(expiresIn));

    res.status(200).json({
      status: 'success',
      data: {
        url: presignedUrl,
        expiresIn: parseInt(expiresIn)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error generating presigned URL',
      error: error.message
    });
  }
};

/**
 * Delete file
 */
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await FileUpload.findOne({
      _id: id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({
        status: 'error',
        message: 'File not found'
      });
    }

    // Check access permissions
    if (!file.canUserAccess(req.user._id, 'delete')) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Delete from cloud storage
    await cloudStorageService.deleteFile(file.provider, file.storagePath);
    
    // Soft delete record
    await file.softDelete(req.user._id);

    res.status(200).json({
      status: 'success',
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting file',
      error: error.message
    });
  }
};

/**
 * Get storage statistics
 */
export const getStorageStats = async (req, res) => {
  try {
    const organizationId = req.user.organizationId || null;
    const stats = await FileUpload.getStorageStats(organizationId);

    res.status(200).json({
      status: 'success',
      data: {
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching storage statistics',
      error: error.message
    });
  }
};

/**
 * Get available storage providers
 */
export const getStorageProviders = async (req, res) => {
  try {
    const providers = cloudStorageService.getAvailableProviders();

    res.status(200).json({
      status: 'success',
      data: {
        providers
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching storage providers',
      error: error.message
    });
  }
};

/**
 * Cleanup expired files
 */
export const cleanupExpiredFiles = async (req, res) => {
  try {
    const results = await FileUpload.cleanupExpired();

    res.status(200).json({
      status: 'success',
      message: 'Expired files cleanup completed',
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error cleaning up expired files',
      error: error.message
    });
  }
};

// Export middleware for file uploads
export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', 10); // Max 10 files
