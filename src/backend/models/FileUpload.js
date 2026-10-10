/**
 * File Upload model for cloud storage management
 * Additive only - does not modify existing functionality
 */
import mongoose from 'mongoose';

const fileUploadSchema = new mongoose.Schema({
  // File information
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  
  // Storage information
  provider: {
    type: String,
    enum: ['local', 's3', 'gcp', 'azure'],
    required: true
  },
  storagePath: {
    type: String,
    required: true
  },
  publicUrl: {
    type: String,
    default: null
  },
  secureUrl: {
    type: String,
    default: null
  },
  
  // File categorization
  category: {
    type: String,
    enum: ['profile', 'restaurant', 'menu', 'document', 'backup', 'logo', 'banner', 'rider-document', 'kyc-documents', 'other'],
    required: true
  },
  
  // Ownership and access
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  
  // Access control
  isPublic: {
    type: Boolean,
    default: false
  },
  permissions: {
    canView: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    canDownload: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    canDelete: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  
  // Metadata
  metadata: {
    width: Number,
    height: Number,
    duration: Number, // for videos
    format: String,
    encoding: String,
    checksum: String,
    exif: mongoose.Schema.Types.Mixed
  },
  
  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'completed'
  },
  processingError: String,
  
  // Thumbnails and derivatives
  thumbnails: [{
    size: String, // 'small', 'medium', 'large'
    url: String,
    width: Number,
    height: Number
  }],
  
  // Usage tracking
  downloadCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date,
  
  // Expiration and cleanup
  expiresAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
fileUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
fileUploadSchema.index({ organizationId: 1, createdAt: -1 });
fileUploadSchema.index({ category: 1, createdAt: -1 });
fileUploadSchema.index({ provider: 1 });
fileUploadSchema.index({ isDeleted: 1 });
fileUploadSchema.index({ expiresAt: 1 });

// Instance methods
fileUploadSchema.methods.generatePresignedUrl = async function(expiresIn = 3600) {
  const cloudService = (await import('../services/cloudStorageService.js')).default;
  return cloudService.generatePresignedUrl(this.provider, this.storagePath, expiresIn);
};

fileUploadSchema.methods.incrementDownload = function() {
  this.downloadCount += 1;
  this.lastAccessedAt = new Date();
  return this.save();
};

fileUploadSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

fileUploadSchema.methods.canUserAccess = function(userId, action = 'view') {
  // Owner can always access
  if (this.uploadedBy.toString() === userId.toString()) {
    return true;
  }
  
  // Public files can be viewed by anyone
  if (action === 'view' && this.isPublic) {
    return true;
  }
  
  // Check permissions
  switch (action) {
    case 'view':
      return this.permissions.canView.includes(userId);
    case 'download':
      return this.permissions.canDownload.includes(userId);
    case 'delete':
      return this.permissions.canDelete.includes(userId);
    default:
      return false;
  }
};

// Static methods
fileUploadSchema.statics.findByUser = function(userId, options = {}) {
  const filter = { 
    uploadedBy: userId, 
    isDeleted: false 
  };
  
  if (options.category) {
    filter.category = options.category;
  }
  
  if (options.organizationId) {
    filter.organizationId = options.organizationId;
  }
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

fileUploadSchema.statics.findByOrganization = function(organizationId, options = {}) {
  const filter = { 
    organizationId, 
    isDeleted: false 
  };
  
  if (options.category) {
    filter.category = options.category;
  }
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

fileUploadSchema.statics.findExpired = function() {
  return this.find({
    expiresAt: { $lt: new Date() },
    isDeleted: false
  });
};

fileUploadSchema.statics.getStorageStats = function(organizationId = null) {
  const match = { isDeleted: false };
  if (organizationId) {
    match.organizationId = organizationId;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          provider: '$provider',
          category: '$category'
        },
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
        avgSize: { $avg: '$size' }
      }
    },
    {
      $group: {
        _id: '$_id.provider',
        categories: {
          $push: {
            category: '$_id.category',
            count: '$count',
            totalSize: '$totalSize',
            avgSize: '$avgSize'
          }
        },
        totalCount: { $sum: '$count' },
        totalSize: { $sum: '$totalSize' }
      }
    },
    { $sort: { totalSize: -1 } }
  ]);
};

fileUploadSchema.statics.cleanupExpired = async function() {
  const expiredFiles = await this.findExpired();
  const cloudService = (await import('../services/cloudStorageService.js')).default;
  const results = [];
  
  for (const file of expiredFiles) {
    try {
      await cloudService.deleteFile(file.provider, file.storagePath);
      await file.softDelete(null);
      results.push({ id: file._id, status: 'deleted' });
    } catch (error) {
      results.push({ id: file._id, status: 'error', error: error.message });
    }
  }
  
  return results;
};

// Pre-save middleware
fileUploadSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    // Set default expiration for non-profile images (30 days)
    if (!['profile', 'logo'].includes(this.category)) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      this.expiresAt = expiresAt;
    }
  }
  next();
});

const FileUpload = mongoose.model('FileUpload', fileUploadSchema);

export default FileUpload;
