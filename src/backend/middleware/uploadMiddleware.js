import multer from 'multer';
import path from 'path';
import fs from 'fs';

// File type configurations
const FILE_TYPES = {
  IMAGE: {
    /*
     * Every still image a browser can draw.
     *
     * This was jpg/jpeg/png while the console's file picker offered
     * `image/*`, so the picker invited a file the server then refused: a
     * poster saved from the web is a .webp, and Chrome on Windows saves a
     * JPEG as .jfif. Both were rejected as an "invalid file type" for a
     * picture that displays perfectly well.
     *
     * .heic stays out on purpose — an iPhone photo in that format is not
     * shown by most browsers, so accepting it would put a banner on the
     * customer's home screen that many people could not see.
     */
    extensions: ['.jpg', '.jpeg', '.jfif', '.pjpeg', '.pjp', '.png', '.webp', '.gif', '.avif'],
    // A photo straight off a phone is routinely 4-8MB, and a banner chosen
    // from the camera roll was refused for being ordinary.
    maxSize: 8 * 1024 * 1024, // 8MB
    mimeType: [
      'image/jpeg',
      'image/pjpeg',
      'image/png',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/avif'
    ]
  },
  DOCUMENT: {
    extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxSize: 5 * 1024 * 1024, // 5MB
    mimeType: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
  }
};

// Ensure directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Generate secure filename
const generateSecureFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const ext = path.extname(originalname).toLowerCase();
  return `${timestamp}_${randomString}${ext}`;
};

// Validate file type and size
const validateFile = (fileType) => {
  return (req, file, cb) => {
    const config = FILE_TYPES[fileType.toUpperCase()];
    if (!config) {
      return cb(new Error('Invalid file type configuration'), false);
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.extensions.includes(ext)) {
      return cb(new Error(`Invalid file type. Allowed types: ${config.extensions.join(', ')}`), false);
    }

    /*
     * Check MIME type, allowing the browser to be vague.
     *
     * The extension is already checked against a fixed list above, which is
     * what actually keeps anything but a picture out. Some browsers and file
     * pickers report a perfectly good image as a plain stream — a .jfif or a
     * .webp dragged from certain apps arrives as application/octet-stream —
     * and refusing those meant an admin was told their image was not an image.
     */
    const VAGUE = ['application/octet-stream', 'binary/octet-stream', ''];
    const declared = (file.mimetype || '').toLowerCase();
    if (!config.mimeType.includes(declared) && !VAGUE.includes(declared)) {
      return cb(new Error(`Invalid file format. Allowed formats: ${config.mimeType.join(', ')}`), false);
    }

    cb(null, true);
  };
};

// Storage configuration
const createStorage = (uploadPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const fullPath = path.join(process.cwd(), 'uploads', uploadPath);
      ensureDirectoryExists(fullPath);
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      const secureName = generateSecureFilename(file.originalname);
      cb(null, secureName);
    }
  });
};

// Delete old file
const deleteOldFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error deleting old file:', error);
    }
  }
};

// Main upload middleware factory
export const createUploadMiddleware = (options = {}) => {
  const {
    fileType = 'IMAGE',
    uploadPath = 'general',
    singleFile = true,
    fieldName = 'file'
  } = options;

  const storage = createStorage(uploadPath);

  const upload = multer({
    storage,
    fileFilter: validateFile(fileType),
    limits: {
      fileSize: FILE_TYPES[fileType.toUpperCase()]?.maxSize || FILE_TYPES.IMAGE.maxSize
    }
  });

  return singleFile ? upload.single(fieldName) : upload.array(fieldName);
};

// Specific upload configurations
export const uploadRestaurantImage = createUploadMiddleware({
  fileType: 'IMAGE',
  uploadPath: 'restaurants',
  fieldName: 'image'
});

export const uploadBannerImage = createUploadMiddleware({
  fileType: 'IMAGE',
  uploadPath: 'banners',
  fieldName: 'image'
});

export const uploadRestaurantDocument = createUploadMiddleware({
  fileType: 'DOCUMENT',
  uploadPath: 'restaurants',
  fieldName: 'document'
});

export const uploadDeliveryBoyImage = createUploadMiddleware({
  fileType: 'IMAGE',
  uploadPath: 'delivery-boys',
  fieldName: 'image'
});

export const uploadDeliveryBoyDocument = createUploadMiddleware({
  fileType: 'DOCUMENT',
  uploadPath: 'delivery-boys',
  fieldName: 'document'
});

export const uploadProfilePhoto = createUploadMiddleware({
  fileType: 'IMAGE',
  uploadPath: 'profile-photos',
  fieldName: 'profilePhoto'
});

// Helper function to get file path for database storage
export const getFilePath = (uploadPath, filename) => {
  return `uploads/${uploadPath}/${filename}`;
};

// Helper function to delete old file and update with new one
export const handleFileReplacement = async (model, id, field, newFilePath) => {
  try {
    const document = await model.findById(id);
    if (!document) {
      throw new Error('Document not found');
    }

    // Delete old file if exists
    const oldFilePath = document[field];
    if (oldFilePath) {
      const fullPath = path.join(process.cwd(), oldFilePath);
      deleteOldFile(fullPath);
    }

    // Update with new file path
    document[field] = newFilePath;
    await document.save();

    return document;
  } catch (error) {
    // If there's an error, delete the newly uploaded file
    if (newFilePath) {
      const fullPath = path.join(process.cwd(), newFilePath);
      deleteOldFile(fullPath);
    }
    throw error;
  }
};

// Error handling middleware for file uploads
export const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large',
        error: error.message
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
        error: error.message
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field',
        error: error.message
      });
    }
  }

  if (error.message.includes('Invalid file type') || error.message.includes('Invalid file format')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }

  next(error);
};

// Middleware for vendor creation with multiple files
export const uploadVendorDocuments = multer({
  storage: createStorage('restaurants'),
  fileFilter: (req, file, cb) => {
    // Allow multiple file types for vendor creation
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const allowedDocTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedDocTypes];
    
    if (allAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: jpg, jpeg, png, pdf'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 4 // Max 4 files (image, foodLicense, gst, cancelCheque)
  }
  }).fields([
  { name: 'image', maxCount: 1 },
  { name: 'foodLicenseDocument', maxCount: 1 },
  { name: 'gstDocument', maxCount: 1 },
  { name: 'cancelChequeDocument', maxCount: 1 }
]);

export default {
  createUploadMiddleware,
  uploadRestaurantImage,
  uploadBannerImage,
  uploadRestaurantDocument,
  uploadDeliveryBoyImage,
  uploadDeliveryBoyDocument,
  uploadProfilePhoto,
  uploadVendorDocuments,
  getFilePath,
  handleFileReplacement,
  handleUploadError
};
