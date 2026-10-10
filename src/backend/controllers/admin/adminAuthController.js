/**
 * Admin-only auth controller. Isolated from existing authController.
 * Admin login: POST /admin/login (only users with role 'admin' can log in).
 * Does NOT modify existing /auth routes or authController.
 */
import User from '../../models/User.js';
import { signChallenge } from './adminTwoFactorController.js';
import { signToken } from '../../utils/jwt.js';
import multer from 'multer';
import cloudStorageService from '../../services/cloudStorageService.js';

// Configure multer for profile image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
  }
});

/**
 * Admin login - POST /admin/login
 * Only users with role 'admin' can authenticate here.
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password',
      });
    }

    const user = await User.findOne({ email }).select('+password +twoFactor.secret');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'error',
        message: 'Incorrect email or password',
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin login only.',
      });
    }

    /**
     * With two-step sign-in on, the password buys a challenge and nothing
     * else. No session token is issued until a code from the admin's
     * authenticator has been checked, so a stolen password on its own opens
     * nothing.
     */
    if (user.twoFactor?.enabled) {
      return res.status(200).json({
        status: 'success',
        requiresTwoFactor: true,
        challenge: signChallenge(user._id),
        message: 'Enter the 6-digit code from your authenticator app.',
      });
    }

    const token = signToken(user._id);
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: userResponse,
      },
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * Get current admin profile - GET /admin/me (protected)
 */
export const adminMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found',
      });
    }
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          status: user.status,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * Update admin profile - PUT /admin/profile (protected)
 * Body: { name, email, phone }
 */
export const adminUpdateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and email are required',
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address',
      });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: userId } 
    });
    
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already taken by another user',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found',
      });
    }

    // Update profile fields
    user.name = name;
    user.email = email;
    if (phone !== undefined) {
      user.phone = phone;
    }

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          status: user.status,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update profile',
    });
  }
};

/**
 * Change admin password - POST /admin/change-password (protected)
 * Body: { currentPassword, newPassword }
 * Uses existing User schema and comparePassword; no schema changes.
 */
export const adminChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide current password and new password',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 8 characters long',
      });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to change password',
    });
  }
};

/**
 * Upload admin profile image - POST /admin/profile/image (protected)
 * Uses multer middleware for file upload
 */
export const adminUploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded',
      });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found',
      });
    }

    // For development, store a simple data URL or placeholder
    // In production, you would use cloud storage like AWS S3, Cloudinary, etc.
    const buffer = req.file.buffer;
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    // Update user's avatar field
    user.avatar = dataUrl;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile image uploaded successfully',
      data: {
        avatar: dataUrl,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          status: user.status,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload profile image',
    });
  }
};

// Export the upload middleware for use in routes
export const uploadProfileImage = upload.single('profileImage');
