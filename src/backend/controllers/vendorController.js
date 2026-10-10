import Restaurant from '../models/Restaurant.js';
import { DOCUMENT_TYPES } from '../utils/restaurantDocuments.js';
import { uploadedFileUrl } from '../config/s3Upload.js';
import Order, { deriveOrderNumberFromId } from '../models/Order.js';
import User from '../models/User.js';
import FoodItem from '../models/FoodItem.js';
import FileUpload from '../models/FileUpload.js';
import Invoice from '../models/Invoice.js';
import cloudStorageService from '../services/cloudStorageService.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';
import { signToken } from '../utils/jwt.js';
import VendorVisibilityMiddleware from '../middleware/vendorVisibilityMiddleware.js';
import mongoose from 'mongoose';
import { triggerAutoDispatchForReadyOrder } from '../services/riderDispatchService.js';
import websocketService from '../services/websocketService.js';
import { closeOrderCommunicationIfNeeded } from '../services/orderCommunicationLifecycleService.js';

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to vendor - POST /api/vendor/send-otp
export const sendVendorOTP = async (req, res) => {
  try {
    const { email, emailOrPhone, role } = req.body;
    
    // Support both old format (email) and new format (emailOrPhone)
    const emailAddress = email || emailOrPhone;

    if (!emailAddress) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required',
      });
    }

    // Find vendor user
    let user = await User.findOne({ email: emailAddress, role: 'vendor' }).select('+otp +otpExpires');

    if (!user) {
      // Try to find any user with this email to see what role they have
      const anyUser = await User.findOne({ email: emailAddress });

      if (anyUser && anyUser.role !== 'vendor') {
        // In development mode, auto-switch user role to vendor if they're trying to login as vendor
        if (process.env.NODE_ENV === 'development') {
          anyUser.role = 'vendor';
          await anyUser.save();

          // Use this user for OTP
          user = anyUser;
        } else {
          return res.status(400).json({
            status: 'error',
            message: `This email is registered as a ${anyUser.role}. Please select the correct role to login.`,
            userRole: anyUser.role
          });
        }
      }
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'Vendor not found with this email',
        });
      }
    }

    // Find vendor's restaurant (optional for OTP)
    const restaurant = await Restaurant.findOne({ owner: user._id });
    
    // For development, allow OTP even without restaurant or if OTP is disabled
    // In production, you might want to require restaurant setup
    if (restaurant && !restaurant.vendorOtpEnabled && process.env.NODE_ENV !== 'development') {
      return res.status(400).json({
        status: 'error',
        message: 'OTP login is not enabled for this vendor',
      });
    }
    
    // For development, auto-enable OTP if it's disabled
    if (restaurant && !restaurant.vendorOtpEnabled) {
      restaurant.vendorOtpEnabled = true;
      await restaurant.save();
    }

    // Generate OTP and set expiry (5 minutes)
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Update restaurant with OTP if restaurant exists, otherwise store in user session
    if (restaurant) {
      restaurant.vendorOtp = otp;
      restaurant.vendorOtpExpires = otpExpires;
      await restaurant.save();
    } else {
      // Store OTP in user's document for vendors without restaurants
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'OTP sent successfully',
      // In production, don't return OTP
      ...(process.env.NODE_ENV === 'development' && { otp }),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to send OTP',
    });
  }
};

// Verify OTP and login vendor - POST /api/vendor/verify-otp
export const verifyVendorOTP = async (req, res) => {
  try {
    const { email, emailOrPhone, otp, selectedRole } = req.body;
    
    // Support both old format (email) and new format (emailOrPhone)
    const emailAddress = email || emailOrPhone;

    if (!emailAddress || !otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and OTP are required',
      });
    }

    // Find vendor user
    const user = await User.findOne({ email: emailAddress, role: 'vendor' }).select('+otp +otpExpires');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendor not found with this email',
      });
    }

    // Check OTP in restaurant first, then fallback to user document
    let isValidOTP = false;
    
    // Try restaurant OTP first
    const restaurant = await Restaurant.findOne({ 
      owner: user._id,
      vendorOtp: otp,
      vendorOtpExpires: { $gt: new Date() }
    }).select('+vendorOtp +vendorOtpExpires');

    if (restaurant) {
      isValidOTP = true;
      // Clear OTP from restaurant after successful verification
      restaurant.vendorOtp = undefined;
      restaurant.vendorOtpExpires = undefined;
      await restaurant.save();
    } else {
      // Check OTP in user document (for vendors without restaurants)
      if (user.otp === otp && user.otpExpires && user.otpExpires > new Date()) {
        isValidOTP = true;
        // Clear OTP from user document
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();
      }
    }

    if (!isValidOTP) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired OTP',
      });
    }

    // Generate JWT token
    const token = signToken(user._id);

    res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        ...(restaurant && {
          restaurant: {
            _id: restaurant._id,
            name: restaurant.name,
            vendorOtpEnabled: restaurant.vendorOtpEnabled,
          },
        }),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to verify OTP',
    });
  }
};

// Get vendor's restaurant by owner ID
export const getVendorRestaurant = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = await Restaurant.findOne({ owner: userId })
      .select('+kycDocuments +documentRecords');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          image: restaurant.image,
          rating: restaurant.rating,
          deliveryTime: restaurant.deliveryTime,
          estimatedDeliveryMinutes: restaurant.estimatedDeliveryMinutes,
          currentPrepTimeMinutes: restaurant.currentPrepTimeMinutes,
          deliveryBufferMinutes: restaurant.deliveryBufferMinutes,
          deliveryFee: restaurant.deliveryFee,
          /** Shown and edited on Order Settings; it was never sent. */
          dailyPackagingFee: restaurant.dailyPackagingFee,
          address: restaurant.address,
          phone: restaurant.phone,
          openingHours: restaurant.openingHours,
          description: restaurant.description,
          categories: restaurant.categories,
          status: restaurant.status,
          isOpen: restaurant.isOpen,
          kycDocuments: restaurant.kycDocuments || {},

          /*
           * The reference every screen should print for this outlet. The app
           * was deriving its own from the Mongo id and disagreeing with the
           * admin console about the same restaurant.
           */
          outletId: restaurant.outletId || null,

          /** When the kitchen is open, by day and slot. */
          workingHours: restaurant.workingHours || [],

          /** The photos of the place, for the onboarding gallery. */
          images: restaurant.images || [],

          /*
           * What the admin panel actually records against a document - its
           * file, number, expiry and whether it has been verified. Only the
           * legacy flat `kycDocuments` map was being sent, which is why the
           * vendor app said "No documents uploaded" about documents an admin
           * had uploaded minutes earlier.
           */
          documentRecords: restaurant.documentRecords
            ? Object.fromEntries(restaurant.documentRecords)
            : {},
          kycStatus: restaurant.kycStatus || 'pending',
        },
      },
    });
  } catch (error) {
    if (error?.message?.startsWith('Invalid modifier group')) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Update vendor restaurant online/offline availability - PATCH /api/vendor/restaurant/availability
export const updateVendorRestaurantAvailability = async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { isOpen, prepMinutes } = req.body;

    if (typeof isOpen !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isOpen must be a boolean value',
      });
    }

    const transitioningToOnline = restaurant.isOpen === false && isOpen === true;
    if (transitioningToOnline) {
      const prep = Number(prepMinutes);
      if (!Number.isFinite(prep) || prep < 5 || prep > 180) {
        return res.status(400).json({
          status: 'error',
          message: 'prepMinutes is required when going online and must be between 5 and 180',
        });
      }
      const buffer = Number.isFinite(Number(restaurant.deliveryBufferMinutes))
        ? Number(restaurant.deliveryBufferMinutes)
        : 15;
      const estimatedDeliveryMinutes = prep + buffer;
      restaurant.currentPrepTimeMinutes = prep;
      restaurant.deliveryBufferMinutes = buffer;
      restaurant.estimatedDeliveryMinutes = estimatedDeliveryMinutes;
      restaurant.deliveryTime = `${estimatedDeliveryMinutes} min`;
      restaurant.lastPrepTimeUpdatedAt = new Date();
    } else if (isOpen === true && !restaurant.currentPrepTimeMinutes) {
      console.warn('[Vendor Availability] Restaurant online without prep time:', String(restaurant._id));
    }

    restaurant.isOpen = isOpen;
    await restaurant.save();

    return res.status(200).json({
      status: 'success',
      message: `Restaurant is now ${isOpen ? 'online' : 'offline'}`,
      data: {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          status: restaurant.status,
          isEnabled: restaurant.isEnabled,
          isOpen: restaurant.isOpen,
          deliveryTime: restaurant.deliveryTime,
          estimatedDeliveryMinutes: restaurant.estimatedDeliveryMinutes,
          currentPrepTimeMinutes: restaurant.currentPrepTimeMinutes,
          deliveryBufferMinutes: restaurant.deliveryBufferMinutes,
          lastPrepTimeUpdatedAt: restaurant.lastPrepTimeUpdatedAt,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update restaurant availability',
    });
  }
};

// Update vendor restaurant settings - PATCH /api/vendor/restaurant
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Says what is wrong with a week of working hours, or null if nothing is.
 *
 * Slots are compared as text because "HH:MM" sorts the same way it reads, so
 * an overlap check needs no date arithmetic and no timezone.
 */
function validateWorkingHours(week) {
  if (!Array.isArray(week)) return 'Working hours must be a list of days.';

  for (const entry of week) {
    if (!DAYS.includes(String(entry?.day || '').toLowerCase())) {
      return `"${entry?.day}" is not a day of the week.`;
    }
    if (entry.closed) continue;

    const slots = Array.isArray(entry.slots) ? entry.slots : [];
    for (const slot of slots) {
      if (!HHMM.test(slot?.opensAt || '') || !HHMM.test(slot?.closesAt || '')) {
        return `${entry.day}: times must be written as HH:MM in 24-hour form.`;
      }
      if (slot.closesAt <= slot.opensAt) {
        return `${entry.day}: a slot cannot close at or before it opens (${slot.opensAt}-${slot.closesAt}).`;
      }
    }

    // Two slots that overlap describe the same hour twice; sorted first so
    // only neighbours have to be compared.
    const sorted = [...slots].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].opensAt < sorted[i - 1].closesAt) {
        return `${entry.day}: ${sorted[i - 1].opensAt}-${sorted[i - 1].closesAt} overlaps ${sorted[i].opensAt}-${sorted[i].closesAt}.`;
      }
    }
  }
  return null;
}

/** One entry per day, slots in order, so readers need not sort it themselves. */
function normaliseWorkingHours(week) {
  return week.map((entry) => ({
    day: String(entry.day).toLowerCase(),
    closed: Boolean(entry.closed),
    slots: entry.closed
      ? []
      : [...(entry.slots || [])]
          .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
          .map((slot) => ({
            opensAt: slot.opensAt,
            closesAt: slot.closesAt,
            ...(slot.label ? { label: String(slot.label).trim() } : {}),
          })),
  }));
}

export const updateRestaurant = async (req, res) => {
  try {
    const restaurant = req.restaurant;

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    /**
     * `deliveryRadius` is the vendor's to set.
     *
     * It decides which customers may order from them at all, so nobody is
     * better placed to choose it - and leaving it off this list meant the
     * radius could only ever be whatever it was created with.
     */
    const allowedFields = [
      'name',
      'phone',
      'openingHours',
      'workingHours',
      'deliveryFee',
      'description',
      'address',
      'dailyPackagingFee',
      'deliveryRadius',
      'images',
      // Order Settings edits this; without it the screen saved nothing.
      'currentPrepTimeMinutes',
    ];
    /*
     * Checked before anything is assigned, not inside the loop below.
     *
     * A `return` inside a forEach callback leaves the callback, not the
     * handler - so rejecting from in there sent a 400 and then carried on and
     * sent a second response for the same request. Validated up here, where
     * returning actually stops.
     */
    if (req.body.workingHours !== undefined) {
      const problem = validateWorkingHours(req.body.workingHours);
      if (problem) {
        return res.status(400).json({ status: 'error', message: problem });
      }
    }

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'currentPrepTimeMinutes') {
          // Minutes, and a kitchen that claims zero preparation is a mistake.
          const minutes = Number(req.body[field]);
          restaurant.currentPrepTimeMinutes = Math.min(
            180,
            Math.max(1, Number.isFinite(minutes) ? Math.round(minutes) : 1)
          );
        } else if (field === 'workingHours') {
          restaurant.workingHours = normaliseWorkingHours(req.body.workingHours);
        } else if (field === 'deliveryFee' || field === 'dailyPackagingFee') {
          restaurant[field] = Number(req.body[field]) || 0;
        } else if (field === 'deliveryRadius') {
          // Bounds checked before anything is saved, below.
          restaurant.deliveryRadius = Number(req.body[field]);
        } else if (field === 'address') {
          /**
           * Merged, never replaced.
           *
           * Callers send the part they are changing - the delivery-area
           * screen sends coordinates alone - and assigning the whole object
           * silently deleted the street, city and state that were already
           * there. A restaurant then had a location but no address, which
           * broke the city checks that read it.
           */
          const incoming = req.body.address || {};
          const current = restaurant.address?.toObject?.() ?? restaurant.address ?? {};
          restaurant.address = {
            ...current,
            ...incoming,
            coordinates: {
              ...(current.coordinates || {}),
              ...(incoming.coordinates || {}),
            },
          };
        } else {
          restaurant[field] = req.body[field];
        }
      }
    });
    if (req.body.dailyPackagingFee !== undefined) {
      restaurant.packagingFeeUpdatedAt = new Date();
    }

    /**
     * Refused rather than quietly ignored.
     *
     * Zero would take the restaurant off the map without saying so, and a
     * number large enough to cover the state is not a delivery area - both
     * are more likely a slip than an intention. Accepting the request and
     * discarding the value would leave the vendor believing they had set it.
     */
    if (req.body.deliveryRadius !== undefined) {
      const km = Number(req.body.deliveryRadius);
      if (!Number.isFinite(km) || km < 1 || km > 50) {
        return res.status(400).json({
          status: 'error',
          message: 'Delivery radius must be between 1 and 50 km.',
        });
      }
    }

    await restaurant.save();

    return res.status(200).json({
      status: 'success',
      message: 'Restaurant updated successfully',
      data: {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          image: restaurant.image,
          rating: restaurant.rating,
          deliveryTime: restaurant.deliveryTime,
          estimatedDeliveryMinutes: restaurant.estimatedDeliveryMinutes,
          currentPrepTimeMinutes: restaurant.currentPrepTimeMinutes,
          deliveryBufferMinutes: restaurant.deliveryBufferMinutes,
          deliveryFee: restaurant.deliveryFee,
          dailyPackagingFee: restaurant.dailyPackagingFee,
          packagingFeeUpdatedAt: restaurant.packagingFeeUpdatedAt,
          address: restaurant.address,
          phone: restaurant.phone,
          openingHours: restaurant.openingHours,
          description: restaurant.description,
          categories: restaurant.categories,
          kycDocuments: restaurant.kycDocuments || {},
          status: restaurant.status,
          isOpen: restaurant.isOpen,
          kycDocuments: restaurant.kycDocuments || {},
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update restaurant',
    });
  }
};

// Upload vendor restaurant logo - POST /api/vendor/restaurant/logo
export const uploadVendorRestaurantLogo = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image uploaded',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: 'error',
        message: 'Only JPG, PNG, and WEBP images are allowed',
      });
    }

    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        status: 'error',
        message: 'Image size must be less than 5MB',
      });
    }

    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    const uploadResult = req.file?.location
      ? {
          provider: 's3',
          filename: req.file.key || req.file.originalname,
          storagePath: req.file.key || '',
          publicUrl: req.file.location,
          secureUrl: req.file.location,
        }
      : await cloudStorageService.uploadFile(req.file, 's3', {
          category: 'restaurant-images',
          folder: 'restaurant-images',
          userId,
        });

    restaurant.image = uploadResult.publicUrl;
    await restaurant.save();

    return res.status(200).json({
      status: 'success',
      message: 'Restaurant logo uploaded successfully',
      data: {
        restaurant: {
          _id: restaurant._id,
          image: restaurant.image,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload restaurant logo',
    });
  }
};

// Update vendor profile/restaurant - PUT /api/vendor/profile
export const updateVendorProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = req.restaurant;
    
    const {
      name,
      bio,
      location,
      phone,
      description,
      address,
      openingHours,
      availabilitySlots,
      fssaiCertificate,
      // New fields
      foodLicenseNumber,
      storeCharge,
      upiId,
      foodType,
      vendorOtpEnabled,
      dailyPackagingFee,
      // Document verification status updates (admin only)
      documentVerificationStatus,
      bankDetails,
    } = req.body;

    // Validation for new fields
    if (storeCharge !== undefined && (storeCharge < 0 || isNaN(storeCharge))) {
      return res.status(400).json({
        status: 'error',
        message: 'Store charge must be a non-negative number',
      });
    }

    if (foodType && !['veg', 'non-veg', 'both'].includes(foodType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Food type must be veg, non-veg, or both',
      });
    }

    if (upiId) {
      const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
      if (!upiRegex.test(upiId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid UPI ID format',
        });
      }
    }

    if (foodLicenseNumber) {
      const fssaiRegex = /^[0-9]{14}$/;
      if (!fssaiRegex.test(foodLicenseNumber.replace(/[-\s]/g, ''))) {
        return res.status(400).json({
          status: 'error',
          message: 'FSSAI license number must be 14 digits',
        });
      }
    }

    // GST validation (if provided in gstInfo)
    if (req.body.gstInfo && req.body.gstInfo.gstNumber) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(req.body.gstInfo.gstNumber.replace(/[-\s]/g, ''))) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid GST number format',
        });
      }
    }

    // IFSC validation (if provided in bankDetails)
    if (req.body.bankDetails && req.body.bankDetails.ifsc) {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(req.body.bankDetails.ifsc.toUpperCase())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid IFSC code format',
        });
      }
    }

    // Update user profile
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (name) user.name = name;
    if (bio) user.bio = bio;
    if (phone) user.phone = phone;
    if (location) {
      if (!user.location) user.location = {};
      user.location = location;
    }
    // Update bank details
    if (bankDetails) {
      if (!user.bankDetails) user.bankDetails = {};
      if (bankDetails.accountHolderName !== undefined)
        user.bankDetails.accountHolderName =
          bankDetails.accountHolderName.trim();
      if (bankDetails.accountNumber !== undefined)
        user.bankDetails.accountNumber =
          bankDetails.accountNumber.trim();
      if (bankDetails.ifsc !== undefined)
        user.bankDetails.ifsc =
          bankDetails.ifsc.trim().toUpperCase();
      if (bankDetails.bankName !== undefined)
        user.bankDetails.bankName =
          bankDetails.bankName.trim();
      if (bankDetails.branch !== undefined)
        user.bankDetails.branch =
          bankDetails.branch.trim();
      user.markModified('bankDetails');
    }
    await user.save();

    // Update restaurant
    if (restaurant) {
      if (name) restaurant.name = name;
      if (description) restaurant.description = description;
      if (phone) restaurant.phone = phone;
      if (address) restaurant.address = address;
      if (openingHours) restaurant.openingHours = openingHours;
      if (location) {
        if (!restaurant.address) restaurant.address = {};
        if (typeof location === 'string') {
          restaurant.address.city = location;
        } else {
          restaurant.address = { ...restaurant.address, ...location };
        }
      }
      
      // Update new fields
      if (foodLicenseNumber !== undefined) restaurant.foodLicenseNumber = foodLicenseNumber;
      if (storeCharge !== undefined) restaurant.storeCharge = parseFloat(storeCharge);
      if (upiId !== undefined) restaurant.upiId = upiId;
      if (foodType !== undefined) restaurant.foodType = foodType;
      if (vendorOtpEnabled !== undefined) restaurant.vendorOtpEnabled = vendorOtpEnabled;
      if (dailyPackagingFee !== undefined) {
        const parsedPackagingFee = Number(dailyPackagingFee);
        if (!Number.isFinite(parsedPackagingFee) || parsedPackagingFee < 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Daily packaging fee must be a non-negative number',
          });
        }
        restaurant.dailyPackagingFee = parsedPackagingFee;
        restaurant.packagingFeeUpdatedAt = new Date();
      }
      
      // Only admin can update verification status
      if (req.user.role === 'admin' && documentVerificationStatus) {
        if (documentVerificationStatus.fssaiVerified !== undefined) {
          restaurant.documentVerificationStatus.fssaiVerified = documentVerificationStatus.fssaiVerified;
        }
        if (documentVerificationStatus.gstVerified !== undefined) {
          restaurant.documentVerificationStatus.gstVerified = documentVerificationStatus.gstVerified;
        }
        if (documentVerificationStatus.bankVerified !== undefined) {
          restaurant.documentVerificationStatus.bankVerified = documentVerificationStatus.bankVerified;
        }
      }
      
      await restaurant.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          bio: user.bio,
          location: user.location,
          bankDetails: user.bankDetails || {},
        },
        restaurant: restaurant ? {
          _id: restaurant._id,
          name: restaurant.name,
          description: restaurant.description,
          phone: restaurant.phone,
          address: restaurant.address,
          openingHours: restaurant.openingHours,
          // Include new fields
          foodLicenseNumber: restaurant.foodLicenseNumber,
          storeCharge: restaurant.storeCharge,
          upiId: restaurant.upiId,
          foodType: restaurant.foodType,
          vendorOtpEnabled: restaurant.vendorOtpEnabled,
          dailyPackagingFee: restaurant.dailyPackagingFee,
          packagingFeeUpdatedAt: restaurant.packagingFeeUpdatedAt,
          documentVerificationStatus: restaurant.documentVerificationStatus,
        } : null,
      },
    });
  } catch (error) {
    if (error?.message?.startsWith('Invalid modifier group')) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Get vendor orders - GET /api/vendor/orders?status=...
export const getVendorOrders = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const { status } = req.query;

    console.log('=== BACKEND VENDOR ORDERS DEBUG ===');
    console.log('Vendor restaurant ID:', restaurantId);
    console.log('Status filter:', status);

    // Build query filter
    const query = {
      restaurantId,
      status: { $ne: 'Payment Pending' },
    };

    // Filter by status based on tabs
    if (status) {
      switch (status) {
        case 'received':
          // Received: status = 'Waiting for Confirmation'
          query.status = 'Waiting for Confirmation';
          break;
        case 'confirmed':
          // Confirmed Order: status = 'Order Confirmed'
          query.status = 'Order Confirmed';
          break;
        case 'in-progress':
          // Order in Progress: status = 'Processing' or 'Ready'
          query.status = { $in: ['Processing', 'Ready'] };
          break;
        case 'completed':
          // Completed: status = 'Delivered'
          query.status = 'Delivered';
          break;
        default:
          // If invalid status, return all orders
          query.status = { $ne: 'Payment Pending' };
          break;
      }
    }

    console.log('Query:', query);

    // Fetch orders for this restaurant
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .populate('items.foodItemId', 'name image price')
      .sort({ createdAt: -1 });

    console.log('Orders found:', orders.length);
    console.log('Order statuses:', orders.map(o => ({ _id: o._id, status: o.status, restaurantId: o.restaurantId })));

    // Get counts for each tab
    const receivedCount = await Order.countDocuments({
      restaurantId,
      status: 'Waiting for Confirmation',
    });
    const confirmedCount = await Order.countDocuments({
      restaurantId,
      status: 'Order Confirmed',
    });
    const inProgressCount = await Order.countDocuments({
      restaurantId,
      status: { $in: ['Processing', 'Ready'] },
    });
    const completedCount = await Order.countDocuments({
      restaurantId,
      status: 'Delivered',
    });

    res.status(200).json({
      status: 'success',
      data: {
        orders: orders.map(order => {
          // Get first item for product name and image
          const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
          const productName = firstItem?.name || firstItem?.foodItemId?.name || 'Order Items';
          const productImage = firstItem?.foodItemId?.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=400&fit=crop';
          const itemCount = order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || order.items?.length || 0;

          return {
            id: order._id.toString(),
            orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
            userId: order.userId,
            items: order.items,
            productName,
            productImage,
            itemCount,
            subtotal: order.subtotal,
            tax: order.tax,
            gstAndPackaging: order.gstAndPackaging || order.tax,
            platformFee: order.platformFee || 0,
            deliveryFee: order.deliveryFee,
            walletUsed: order.walletUsed,
            total: order.total,
            status: order.status,
            timeline: order.timeline,
            deliveryAddress: order.deliveryAddress,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            notes: order.notes,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        }),
        counts: {
          received: receivedCount,
          confirmed: confirmedCount,
          inProgress: inProgressCount,
          completed: completedCount,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Update order status - PATCH /api/vendor/orders/:orderId/status
// State machine: 'Waiting for Confirmation' -> 'Order Confirmed' -> 'Processing' -> 'Ready'
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    const restaurantId = req.restaurantId;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID is required',
      });
    }

    // Find order and verify it belongs to vendor's restaurant
    const order = await Order.findOne({
      _id: orderId,
      restaurantId: restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or does not belong to your restaurant',
      });
    }

    /**
     * What a vendor may do to an order.
     *
     * The kitchen's half of the lifecycle and no further: confirm, prepare,
     * mark ready, cancel. Everything from the pickup onwards belongs to the
     * rider, because only the rider is in a position to know it happened.
     *
     * 'OnWay' and 'Delivered' are deliberately absent. The vendor could
     * previously walk an order Ready → OnWay → Delivered and close it from
     * behind the counter, which reports a delivery nobody made and skips the
     * verification the customer relies on. Those two transitions are the
     * rider's, through /rider/orders/:id/pickup-verify and /deliver.
     */
    const stateMachine = {
      'Waiting for Confirmation': ['Order Confirmed', 'Cancelled'],
      'Order Confirmed': ['Processing', 'Cancelled'],
      'Processing': ['Ready', 'Processing', 'Cancelled'], // Can stay in Processing or move to Ready or Cancel
      'Ready': ['Ready', 'Cancelled'], // Handover to the rider is the rider's to make
      'OnWay': [], // With the rider now — the vendor is done
      'Delivered': [], // Terminal state
      'Cancelled': [], // Terminal state
      // Backward compatibility
      'Pending': ['Order Confirmed', 'Processing', 'Cancelled'],
      'Preparing': ['Ready', 'Processing', 'Cancelled'],
    };

    /**
     * Said plainly, because "allowed transitions: (none)" reads like a bug
     * when it is in fact the rule.
     */
    const RIDER_OWNED = {
      OnWay: 'Only the delivery partner can take an order out for delivery, by verifying the pickup.',
      Delivered:
        'Only the delivery partner can mark an order delivered, after the customer verifies it.',
    };

    // If status is provided, validate state transition
    if (status) {
      const currentStatus = order.status;
      const allowedNextStatuses = stateMachine[currentStatus] || [];

      // Check if transition is valid
      if (!allowedNextStatuses.includes(status)) {
        if (RIDER_OWNED[status]) {
          return res.status(403).json({
            status: 'error',
            message: RIDER_OWNED[status],
            currentStatus,
            allowedNextStatuses,
          });
        }
        return res.status(400).json({
          status: 'error',
          message: `Invalid status transition. Cannot change from '${currentStatus}' to '${status}'. Allowed transitions: ${allowedNextStatuses.join(', ')}`,
          currentStatus,
          allowedNextStatuses,
        });
      }

      // Update status
      order.status = status;
      
      // When status is set to 'Ready', ensure riderId is null (order available for riders)
      if (status === 'Ready' && order.riderId) {
        order.riderId = null;
      }
      
      // Add timeline entry
      const statusMessages = {
        'Order Confirmed': 'Order confirmed by vendor',
        'Processing': 'Order is being processed',
        'Ready': 'Order is ready for shipment',
        'OnWay': 'Order is out for delivery',
        'Delivered': 'Order has been delivered',
        'Cancelled': 'Order has been cancelled',
      };

      order.timeline.push({
        status: status,
        timestamp: new Date(),
        message: statusMessages[status] || `Order status updated to ${status}`,
      });
    }

    // Update notes if provided
    if (notes !== undefined) {
      order.notes = notes;
    }

    // Save the order
    await order.save();
    await closeOrderCommunicationIfNeeded(order._id);
    
    const savedOrder = await Order.findById(order._id);
    if (status === 'Ready' && savedOrder?.riderId) {
      savedOrder.riderId = null;
      await savedOrder.save();
    }
      if (status === 'Ready' && savedOrder) {
        const restaurant = await Restaurant.findById(savedOrder.restaurantId).select('address name');
        const dispatchResult = await triggerAutoDispatchForReadyOrder(savedOrder, restaurant);
        const refreshedOrder = await Order.findById(savedOrder._id).select('candidateRiderIds');
        websocketService.emitOrderLifecycle({
          order: savedOrder,
          eventName: 'order_ready',
          source: 'vendor',
          userId: savedOrder.userId ? String(savedOrder.userId) : null,
          vendorId: req.user?._id ? String(req.user._id) : null,
          candidateRiderIds: refreshedOrder?.candidateRiderIds || [],
          restaurant,
        });
        console.log('[AUTO_DISPATCH]', {
          orderId: savedOrder._id.toString(),
          restaurantId: String(savedOrder.restaurantId),
          candidates: dispatchResult.candidates,
          reason: dispatchResult.reason,
        });
      } else if (savedOrder) {
        websocketService.emitOrderLifecycle({
          order: savedOrder,
          eventName: status === 'Cancelled' ? 'order_cancelled' : 'order_updated',
          source: 'vendor',
          userId: savedOrder.userId ? String(savedOrder.userId) : null,
          vendorId: req.user?._id ? String(req.user._id) : null,
          riderId: savedOrder.riderId ? String(savedOrder.riderId) : null,
        });
      }

    // Populate order for response
    await order.populate('userId', 'name email phone');
    await order.populate('items.foodItemId', 'name image price');
    const responseData = {
      status: 'success',
      message: 'Order updated successfully',
      data: {
        order: {
          id: order._id.toString(),
          orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
          userId: order.userId,
          items: order.items,
          subtotal: order.subtotal,
          tax: order.tax,
          gstAndPackaging: order.gstAndPackaging || order.tax,
          platformFee: order.platformFee || 0,
          deliveryFee: order.deliveryFee,
          walletUsed: order.walletUsed,
          total: order.total,
          status: order.status,
          timeline: order.timeline,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          notes: order.notes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Get vendor menu - GET /api/vendor/menu
export const getVendorMenu = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    // Get all food items for this restaurant
    const foodItems = await FoodItem.find({ restaurantId })
      .sort({ category: 1, name: 1 });

    res.status(200).json({
      status: 'success',
      data: {
        menu: foodItems.map(item => ({
          ...(() => {
            const legacyGroup = (item.addons || []).length > 0 ? [{
              _id: 'legacy-addons',
              name: 'Add-ons',
              required: false,
              minSelect: 0,
              maxSelect: null,
              options: (item.addons || []).map((addon, idx) => ({
                _id: addon._id || `legacy-${idx}`,
                name: addon.name,
                price: addon.price || 0,
                isAvailable: true,
              })),
            }] : [];
            const normalizedGroups = Array.isArray(item.modifierGroups) && item.modifierGroups.length > 0
              ? item.modifierGroups
              : legacyGroup;
            return { modifierGroups: normalizedGroups };
          })(),
          _id: item._id.toString(),
          name: item.name,
          price: item.price,
          description: item.description || '',
          image: item.image || '',
          category: item.category || '',
          cuisine: item.cuisine || '',
          foodType: item.foodType || 'veg',
          isVeg: (item.foodType || 'veg') === 'veg',
          // Included explicitly: these mappers list every field by hand, so a
          // new one is invisible to the client until it is named here — the
          // discount saved correctly and simply never came back.
          discountType: item.discountType || 'none',
          availableFrom: item.availableFrom || '',
          availableTo: item.availableTo || '',
          availableDays: item.availableDays || [],
          discountValue: item.discountValue || 0,
          effectivePrice: item.effectivePrice ?? item.price,
          addons: item.addons || [],
          isAvailable: item.isAvailable,
          preparationTime: item.preparationTime || 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Add new food item - POST /api/vendor/menu
export const addFoodItem = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const {
      name,
      price,
      description,
      category,
      cuisine,
      image,
      addons,
      discountType,
      discountValue,
      availableFrom,
      availableTo,
      availableDays,
      preparationTime,
      isAvailable = true,
      foodType = 'veg',
      modifierGroups = [],
    } = req.body;
    const normalizedModifierGroups = normalizeAndValidateModifierGroups(modifierGroups);

    // Debug logging to track incoming price
    console.log("=== VENDOR ADD FOOD ITEM PRICE DEBUG ===");
    console.log("Incoming price:", price);
    console.log("Price type:", typeof price);
    console.log("==========================================");

    // Validate required fields
    if (!name || !price) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and price are required',
      });
    }

    if (price < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Price must be a positive number',
      });
    }
    if (!['veg', 'non-veg', 'egg'].includes(foodType)) {
      return res.status(400).json({
        status: 'error',
        message: 'foodType must be veg, non-veg, or egg',
      });
    }

    // Create food item
    const foodItem = new FoodItem({
      name: name.trim(),
      price: parseFloat(price),
      description: description?.trim() || '',
      category: category?.trim() || '',
      cuisine: cuisine?.trim() || '',
      image: image || '',
      restaurantId,
      addons: normalizeAddons(addons),
      // `price` stays the list price; the customer-facing figure is derived
      // from these so a stale discounted price cannot outlive its discount.
      discountType: discountType || 'none',
      discountValue: Number(discountValue) || 0,
      // Empty means always available, which is what every existing dish is.
      availableFrom: availableFrom || '',
      availableTo: availableTo || '',
      availableDays: normalizeAvailableDays(availableDays),
      modifierGroups: normalizedModifierGroups,
      preparationTime: preparationTime || 0,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      foodType,
    });

    await foodItem.save();

    // Debug logging to track saved price
    console.log("Saved food item price:", foodItem.price);
    console.log("==========================================");

    res.status(201).json({
      status: 'success',
      message: 'Food item added successfully',
      data: {
        foodItem: {
          _id: foodItem._id.toString(),
          name: foodItem.name,
          price: foodItem.price,
          description: foodItem.description,
          image: foodItem.image,
          category: foodItem.category,
          cuisine: foodItem.cuisine || '',
          foodType: foodItem.foodType || 'veg',
          isVeg: (foodItem.foodType || 'veg') === 'veg',
          // Included explicitly: these mappers list every field by hand, so a
          // new one is invisible to the client until it is named here — the
          // discount saved correctly and simply never came back.
          discountType: foodItem.discountType || 'none',
          availableFrom: foodItem.availableFrom || '',
          availableTo: foodItem.availableTo || '',
          availableDays: foodItem.availableDays || [],
          discountValue: foodItem.discountValue || 0,
          effectivePrice: foodItem.effectivePrice ?? foodItem.price,
          addons: foodItem.addons,
          modifierGroups: foodItem.modifierGroups || [],
          isAvailable: foodItem.isAvailable,
          preparationTime: foodItem.preparationTime,
          createdAt: foodItem.createdAt,
          updatedAt: foodItem.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Update food item - PATCH /api/vendor/menu/:id
export const updateFoodItem = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;
    const {
      name,
      price,
      description,
      category,
      cuisine,
      image,
      addons,
      discountType,
      discountValue,
      availableFrom,
      availableTo,
      availableDays,
      preparationTime,
      isAvailable,
      foodType,
      modifierGroups,
    } = req.body;

    // Debug logging to track incoming price
    if (price !== undefined) {
      console.log("=== VENDOR UPDATE FOOD ITEM PRICE DEBUG ===");
      console.log("Item ID:", id);
      console.log("Incoming price:", price);
      console.log("Price type:", typeof price);
      console.log("============================================");
    }

    // Find food item and verify it belongs to vendor's restaurant
    const foodItem = await FoodItem.findOne({
      _id: id,
      $or: [
        { restaurantId: restaurantId },
        { restaurantId: restaurantId.toString() },
        { restaurant: restaurantId },
      ],
    });

    if (!foodItem) {
      return res.status(404).json({
        status: 'error',
        message: 'Food item not found or does not belong to your restaurant',
      });
    }

    // Update fields if provided
    if (name !== undefined) foodItem.name = name.trim();
    if (price !== undefined) {
      if (price < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Price must be a positive number',
        });
      }
      foodItem.price = parseFloat(price);
      console.log("Updated food item price:", foodItem.price);
    }
    if (description !== undefined) foodItem.description = description.trim();
    if (category !== undefined) foodItem.category = category.trim();
    if (cuisine !== undefined) foodItem.cuisine = cuisine.trim();
    if (foodType !== undefined && !['veg', 'non-veg', 'egg'].includes(foodType)) {
      return res.status(400).json({
        status: 'error',
        message: 'foodType must be veg, non-veg, or egg',
      });
    }
    if (image !== undefined) foodItem.image = image;
    if (addons !== undefined) foodItem.addons = normalizeAddons(addons);
    // Discount is a pair: the kind and the amount. Updating one without the
    // other would turn "10% off" into "₹10 off" on the next save.
    if (discountType !== undefined) foodItem.discountType = discountType || 'none';
    if (discountValue !== undefined) foodItem.discountValue = Number(discountValue) || 0;
    if (availableFrom !== undefined) foodItem.availableFrom = availableFrom || '';
    if (availableTo !== undefined) foodItem.availableTo = availableTo || '';
    if (availableDays !== undefined) {
      foodItem.availableDays = normalizeAvailableDays(availableDays);
    }
    if (modifierGroups !== undefined) {
      foodItem.modifierGroups = normalizeAndValidateModifierGroups(modifierGroups);
    }
    if (preparationTime !== undefined) foodItem.preparationTime = preparationTime;
    if (isAvailable !== undefined) foodItem.isAvailable = isAvailable;
    if (foodType !== undefined) foodItem.foodType = foodType;

    await foodItem.save();

    res.status(200).json({
      status: 'success',
      message: 'Food item updated successfully',
      data: {
        foodItem: {
          _id: foodItem._id.toString(),
          name: foodItem.name,
          price: foodItem.price,
          description: foodItem.description,
          image: foodItem.image,
          category: foodItem.category,
          cuisine: foodItem.cuisine || '',
          foodType: foodItem.foodType || 'veg',
          isVeg: (foodItem.foodType || 'veg') === 'veg',
          // Included explicitly: these mappers list every field by hand, so a
          // new one is invisible to the client until it is named here — the
          // discount saved correctly and simply never came back.
          discountType: foodItem.discountType || 'none',
          availableFrom: foodItem.availableFrom || '',
          availableTo: foodItem.availableTo || '',
          availableDays: foodItem.availableDays || [],
          discountValue: foodItem.discountValue || 0,
          effectivePrice: foodItem.effectivePrice ?? foodItem.price,
          addons: foodItem.addons,
          modifierGroups: foodItem.modifierGroups || [],
          isAvailable: foodItem.isAvailable,
          preparationTime: foodItem.preparationTime,
          createdAt: foodItem.createdAt,
          updatedAt: foodItem.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Delete food item - DELETE /api/vendor/menu/:id
export const deleteFoodItem = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    // Find food item and verify it belongs to vendor's restaurant
    const foodItem = await FoodItem.findOne({
      _id: id,
      $or: [
        { restaurantId: restaurantId },
        { restaurantId: restaurantId.toString() },
        { restaurant: restaurantId },
      ],
    });

    if (!foodItem) {
      return res.status(404).json({
        status: 'error',
        message: 'Food item not found or does not belong to your restaurant',
      });
    }

    // Delete food item
    await FoodItem.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Food item deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Get vendor statistics - GET /api/vendor/stats
export const getVendorStats = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    // First check if user is a vendor
    if (req.user.role !== 'vendor') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Vendor role required.',
      });
    }

    // Find restaurant owned by this vendor
    const restaurant = await Restaurant.findOne({ owner: userId });
    
    if (!restaurant) {
      // No restaurant exists - return default stats with restaurant creation prompt
      return res.status(200).json({
        status: 'success',
        data: {
          totalSales: 0,
          completedOrderCount: 0,
          pendingOrdersCount: 0,
          newLeads: 0,
          dailyChartData: [],
          weeklyChartData: [],
          monthlyChartData: [],
          restaurantStatus: 'not_created',
          isRestaurantEnabled: false,
          isOpen: false,
          needsRestaurantCreation: true,
        },
      });
    }

    // In development mode, auto-approve pending restaurants
    if (process.env.NODE_ENV === 'development' && restaurant.status === 'pending') {
      restaurant.status = 'approved';
      restaurant.isEnabled = true;
      await restaurant.save();
    }

    const restaurantId = restaurant._id;

    // Get total sales (sum of all completed orders)
    const completedOrders = await Order.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          status: 'Delivered',
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalSales = completedOrders.length > 0 ? completedOrders[0].totalSales : 0;
    const completedOrderCount = completedOrders.length > 0 ? completedOrders[0].orderCount : 0;

    // Get pending orders count (new leads) - status = 'Waiting for Confirmation'
    const pendingOrdersCount = await Order.countDocuments({
      restaurantId: restaurantId,
      status: 'Waiting for Confirmation',
    });

    // Get daily sales data for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailySales = await Order.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          status: 'Delivered',
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get weekly sales data for the last 4 weeks
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    fourWeeksAgo.setHours(0, 0, 0, 0);

    const weeklySales = await Order.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          status: 'Delivered',
          createdAt: { $gte: fourWeeksAgo },
        },
      },
      {
        $group: {
          _id: {
            $week: '$createdAt',
          },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get monthly sales data for the last 4 months
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    fourMonthsAgo.setDate(1);
    fourMonthsAgo.setHours(0, 0, 0, 0);

    const monthlySales = await Order.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          status: 'Delivered',
          createdAt: { $gte: fourMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' },
          },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Format daily data for chart (last 7 days)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyChartData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = dailySales.find(d => d._id === dateStr);
      dailyChartData.push({
        value: dayData ? dayData.total : 0,
        label: dayLabels[date.getDay() === 0 ? 6 : date.getDay() - 1],
      });
    }

    // Format weekly data for chart
    const weeklyChartData = weeklySales.slice(-4).map((week, index) => ({
      value: week.total,
      label: `Week ${index + 1}`,
    }));

    // Format monthly data for chart
    const monthlyChartData = monthlySales.slice(-4).map((month, index) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthDate = new Date(month._id + '-01');
      return {
        value: month.total,
        label: monthNames[monthDate.getMonth()],
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        totalSales,
        completedOrderCount,
        pendingOrdersCount,
        newLeads: pendingOrdersCount, // Alias for consistency
        dailyChartData,
        weeklyChartData,
        monthlyChartData,
        restaurantStatus: restaurant.status,
        isRestaurantEnabled: restaurant.isEnabled,
        isOpen: restaurant.isOpen,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Get order by ID with bill summary - GET /api/vendor/orders/:id
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    // Find order and verify it belongs to vendor's restaurant
    const order = await Order.findOne({
      _id: id,
      restaurantId: restaurantId,
    })
      .populate('userId', 'name email phone')
      .populate('items.foodItemId', 'name image price description');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or does not belong to your restaurant',
      });
    }

    // Calculate bill summary
    const itemTotal = order.subtotal || 0;
    const gstAndPackaging = order.gstAndPackaging || order.tax || 0;
    const platformFee = order.platformFee || 0;
    const deliveryFee = order.deliveryFee || 0;
    const walletUsed = order.walletUsed || 0;
    const total = order.total || 0;

    // Format payment method
    const paymentMethodMap = {
      cash: 'Cash on Delivery',
      card: 'Card Payment',
      online: 'Online Payment',
      wallet: 'Wallet Payment',
      mastercard: 'Mastercard',
      visa: 'Visa',
      paypal: 'PayPal',
    };

    res.status(200).json({
      status: 'success',
      data: {
        order: {
          id: order._id.toString(),
          orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
          items: order.items.map(item => ({
            id: item._id,
            foodItemId: item.foodItemId,
            name: item.name || item.foodItemId?.name,
            image: item.foodItemId?.image,
            price: item.price,
            quantity: item.quantity,
            selectedAddons: item.selectedAddons,
            total: item.price * item.quantity + (item.selectedAddons?.reduce((sum, addon) => sum + (addon.price || 0), 0) || 0),
          })),
          billSummary: {
            itemTotal,
            gstAndPackaging,
            platformFee,
            deliveryFee,
            walletUsed,
            subtotal: itemTotal + gstAndPackaging + platformFee + deliveryFee,
            total,
          },
          customer: {
            id: order.userId?._id,
            name: order.userId?.name || 'Customer',
            email: order.userId?.email || '',
            phone: order.userId?.phone || '',
          },
          deliveryAddress: order.deliveryAddress,
          paymentMethod: paymentMethodMap[order.paymentMethod] || order.paymentMethod,
          paymentStatus: order.paymentStatus,
          paymentDate: order.createdAt,
          status: order.status,
          timeline: order.timeline,
          notes: order.notes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Upload vendor documents - POST /api/vendor/upload-document
export const uploadVendorDocument = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { documentType } = req.body; // fssai, gst, cancelCheque

    if (!documentType || !['fssai', 'gst', 'cancelCheque'].includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Document type must be fssai, gst, or cancelCheque',
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

    // Find vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Upload file to cloud storage
    const uploadResult = req.file?.location
      ? {
          provider: 's3',
          filename: req.file.key || req.file.originalname,
          storagePath: req.file.key || '',
          publicUrl: req.file.location,
          secureUrl: req.file.location,
        }
      : await cloudStorageService.uploadFile(req.file, 's3', {
          category: 'vendor-documents',
          userId: userId,
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
      category: 'vendor-documents',
      uploadedBy: userId,
      isPublic: false,
    });

    await fileRecord.save();

    // Update restaurant document field
    if (!restaurant.kycDocuments) {
      restaurant.kycDocuments = {};
    }

    // Map document type to field name
    const documentFieldMap = {
      fssai: 'fssai',
      gst: 'gst',
      cancelCheque: 'cancelledCheque',
    };

    const fieldName = documentFieldMap[documentType];
    if (fieldName) {
      restaurant.kycDocuments[fieldName] = uploadResult.publicUrl;
      await restaurant.save();
    }

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
        restaurant: {
          id: restaurant._id,
          kycDocuments: restaurant.kycDocuments,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload document',
    });
  }
};

// Get vendor documents - GET /api/vendor/documents
export const getVendorDocuments = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    // Find vendor's restaurant with visibility validation
    const restaurant = await Restaurant.findOne({ owner: userId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Validate restaurant visibility and add status
    const restaurantWithVisibility = VendorVisibilityMiddleware.validateForListing(restaurant);
    
    // Get file records for this vendor
    const files = await FileUpload.find({
      uploadedBy: userId,
      category: 'vendor-documents',
      isDeleted: false,
    }).sort({ createdAt: -1 });

    /*
     * Everything filed against this restaurant, however it got there.
     *
     * This listed only FileUpload rows uploaded by the vendor themselves. A
     * document an admin uploaded goes into the restaurant's documentRecords
     * instead, so the vendor app said "No documents uploaded" about paperwork
     * that had been filed for them - which is exactly what the vendor sees
     * when Reditoe onboards a restaurant on their behalf.
     *
     * documentRecords is the canonical set, because it is what the admin
     * panel writes and what the verification state lives on. The vendor's own
     * uploads are folded in after it, and only where they do not already
     * appear there.
     */
    const records = restaurant.documentRecords
      ? Object.fromEntries(restaurant.documentRecords)
      : {};

    const filed = DOCUMENT_TYPES.filter((type) => records[type.key]?.url).map((type) => {
      const record = records[type.key];
      return {
        id: type.key,
        type: type.key,
        title: type.label,
        url: record.url,
        secureUrl: record.url,
        number: record.number || null,
        expiryDate: record.expiryDate || null,
        status: record.status || 'pending',
        verifiedBy: record.verifiedBy || null,
        verifiedAt: record.verifiedAt || null,
        note: record.note || null,
        required: Boolean(type.required),
        uploadedAt: record.verifiedAt || restaurant.updatedAt,
        source: 'admin',
      };
    });

    const alsoUploaded = files
      .filter((file) => !filed.some((doc) => doc.type === file.metadata?.documentType))
      .map((file) => ({
        id: String(file._id),
        type: file.metadata?.documentType || 'unknown',
        title: file.originalName,
        originalName: file.originalName,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        url: file.publicUrl,
        secureUrl: file.secureUrl,
        status: 'pending',
        uploadedAt: file.createdAt,
        source: 'vendor',
      }));

    res.status(200).json({
      status: 'success',
      data: {
        restaurant: restaurantWithVisibility,
        kycStatus: restaurant.kycStatus || 'pending',
        /** Every type the platform asks for, so the app can show what is missing. */
        required: DOCUMENT_TYPES.filter((type) => type.required).map((type) => ({
          key: type.key,
          label: type.label,
          uploaded: Boolean(records[type.key]?.url),
        })),
        documents: [...filed, ...alsoUploaded],
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch documents',
    });
  }
};

// Create restaurant for vendor - POST /api/vendor/restaurant
export const createVendorRestaurant = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // Check if user is a vendor
    if (req.user.role !== 'vendor') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Vendor role required.',
      });
    }

    // Check if restaurant already exists
    const existingRestaurant = await Restaurant.findOne({ owner: userId });
    if (existingRestaurant) {
      return res.status(409).json({
        status: 'error',
        message: 'Restaurant already exists for this vendor',
        data: {
          restaurant: existingRestaurant,
        },
      });
    }

    // Create basic restaurant for vendor
    const restaurant = await Restaurant.create({
      name: req.user.name + '\'s Restaurant',
      owner: userId,
      status: process.env.NODE_ENV === 'development' ? 'approved' : 'pending',
      kycStatus: 'pending',
      isEnabled: process.env.NODE_ENV === 'development', // Enable in development mode
      address: 'Please update your address',
      phone: req.user.phone || '+919876543210',
      email: req.user.email,
      description: 'Restaurant description - please update',
      openingHours: '09:00-22:00',
      location: {
        type: 'Point',
        coordinates: [77.2090, 28.6139] // Default coordinates (Delhi)
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Restaurant created successfully',
      data: {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          status: restaurant.status,
          kycStatus: restaurant.kycStatus,
          isEnabled: restaurant.isEnabled,
          address: restaurant.address,
          phone: restaurant.phone,
          email: restaurant.email,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create restaurant',
    });
  }
};

// Test PDF generation endpoint - GET /api/vendor/test-pdf
export const testPDFGeneration = async (req, res) => {
  try {
    
    // Create a simple test invoice
    const testData = {
      invoiceNumber: 'TEST-001',
      issueDate: new Date(),
      dueDate: new Date(),
      customerId: { name: 'Test Customer' },
      billingAddress: { fullAddress: '123 Test Street, Test City' },
      lineItems: [
        {
          description: 'Test Item 1',
          quantity: 2,
          price: 100.00,
          total: 200.00
        },
        {
          description: 'Test Item 2',
          quantity: 1,
          price: 50.00,
          total: 50.00
        }
      ],
      subtotal: 250.00,
      taxAmount: 25.00,
      grandTotal: 275.00
    };
    
    const pdfBuffer = await generateInvoicePDF(testData);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test-invoice.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate test PDF',
      error: error.message
    });
  }
};

// Download invoice PDF for vendor - GET /api/vendor/orders/:orderId/invoice
export const downloadOrderInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const vendorId = req.user._id;

    // Handle order ID with hash symbol - strip it and search by orderNumber
    const cleanOrderId = orderId.startsWith('#') ? orderId.substring(1) : orderId;
    
    // Try to find order by orderNumber first (for frontend order IDs)
    let order = await Order.findOne({ orderNumber: { $regex: cleanOrderId, $options: 'i' } }).populate('restaurantId');
    
    // If not found, try by ObjectId
    if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).populate('restaurantId');
    }
    
    // If still not found, check if this is a mock order and create a sample invoice
    if (!order) {
      
      // Create a sample invoice for demo purposes with data matching mobile app
      const sampleInvoiceData = {
        invoiceNumber: orderId,
        issueDate: new Date(),
        dueDate: new Date(),
        customerId: {
          name: 'Samarath',
        },
        billingAddress: {
          fullAddress: '23 rishi nagar new lork bhopal'
        },
        lineItems: [
          {
            description: 'Spicy Paneer Burger',
            quantity: 1,
            price: 450.00,
            total: 450.00
          },
          {
            description: 'Masala Regular Sandwich',
            quantity: 2,
            price: 120.00,
            total: 240.00
          }
        ],
        subtotal: 240.00,
        taxAmount: 26.00,
        grandTotal: 292.00
      };

      // Get restaurant info (optional for demo invoices)
      let restaurant = null;
      if (req.restaurantId) {
        restaurant = await Restaurant.findById(req.restaurantId);
      }
      
      const pdfBuffer = await generateInvoicePDF(sampleInvoiceData);

      // Validate PDF buffer before sending
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Generated sample PDF buffer is empty');
      }
      
      if (!pdfBuffer.toString('ascii', 0, 5).startsWith('%PDF')) {
        throw new Error('Generated sample data is not a valid PDF');
      }

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderId}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
      return;
    }

    // Verify this order belongs to vendor's restaurant
    if (order.restaurantId.owner.toString() !== vendorId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. This order does not belong to your restaurant.'
      });
    }

    // Only generate invoice for completed/delivered orders
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        status: 'error',
        message: 'Invoice can only be downloaded for delivered orders'
      });
    }

    // Check if invoice already exists
    let invoice = await Invoice.findOne({ orderId: order._id });
    
    // If no invoice exists, create one
    if (!invoice) {
      
      invoice = new Invoice({
        orderId: order._id,
        vendorId: vendorId,
        customerId: order.userId,
        restaurantId: order.restaurantId._id,
        invoiceNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
        lineItems: order.items.map(item => ({
          name: item.name || 'Item',
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity
        })),
        subtotal: order.subtotal || 0,
        deliveryFee: order.deliveryFee || 0,
        taxAmount: order.gstAndPackaging || order.tax || 0,
        grandTotal: order.total || 0,
        paymentMethod: order.paymentMethod === 'cod' ? 'cash' : (order.paymentMethod || 'cash'),
        status: 'paid',
        issueDate: new Date(),
        dueDate: new Date()
      });

      await invoice.save();
    }

    // Generate PDF
    // Transform invoice data to match PDF generator format
    const pdfInvoiceData = {
      invoiceNumber: invoice.invoiceNumber || invoice.orderNumber,
      issueDate: invoice.issueDate || invoice.issuedDate,
      dueDate: invoice.dueDate,
      customerId: {
        name: order.userId?.name || 'Customer',
      },
      billingAddress: {
        fullAddress: order.deliveryAddress ? 
          `${order.deliveryAddress.street || ''}, ${order.deliveryAddress.city || ''}, ${order.deliveryAddress.state || ''} ${order.deliveryAddress.zipCode || ''}` : 
          'N/A'
      },
      lineItems: invoice.lineItems ? invoice.lineItems.map(item => ({
        description: item.name,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.totalPrice
      })) : invoice.items?.map(item => ({
        description: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount || invoice.taxes || 0,
      grandTotal: invoice.grandTotal || invoice.totalAmount || 0
    };
    
    const pdfBuffer = await generateInvoicePDF(pdfInvoiceData);
    
    // Validate PDF buffer before sending
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty');
    }
    
    if (!pdfBuffer.toString('ascii', 0, 5).startsWith('%PDF')) {
      throw new Error('Generated data is not a valid PDF');
    }

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber || invoice._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to download invoice',
      error: error.message
    });
  }
};

export const uploadMenuItemImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image uploaded',
      });
    }

    const imageUrl = uploadedFileUrl(req.file);

    return res.status(200).json({
      status: 'success',
      data: {
        imageUrl,
      },
    });
  } catch (error) {
    console.error('uploadMenuItemImage error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload image',
    });
  }
};

/**
 * Add-ons as the schema stores them.
 *
 * `isAvailable` is read with `!== false` so an add-on saved before the field
 * existed stays on sale rather than disappearing from every menu at once.
 */
const normalizeAddons = (addons) =>
  (Array.isArray(addons) ? addons : [])
    .filter((addon) => String(addon?.name || '').trim())
    .map((addon) => ({
      _id: addon?._id,
      name: String(addon.name).trim(),
      price: Number(addon?.price ?? 0),
      isAvailable: addon?.isAvailable !== false,
    }));

/** The days a dish may be limited to; anything else is not a weekday. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const normalizeAvailableDays = (days) => {
  const list = Array.isArray(days) ? days : [];
  // Ordered by the week, not by the order they were tapped, and de-duplicated
  // so the same day cannot be stored twice.
  return WEEKDAYS.filter((day) => list.includes(day));
};

const normalizeAndValidateModifierGroups = (modifierGroups) => {
  const groups = Array.isArray(modifierGroups) ? modifierGroups : [];

  return groups.map((group, index) => {
    const minSelect = Number(group?.minSelect ?? 0);
    const maxSelect = group?.maxSelect == null ? null : Number(group.maxSelect);
    const required = Boolean(group?.required);

    if (!Number.isFinite(minSelect) || minSelect < 0) {
      throw new Error(`Invalid modifier group at index ${index}: minSelect must be a non-negative number`);
    }
    if (maxSelect != null && (!Number.isFinite(maxSelect) || maxSelect < 0)) {
      throw new Error(`Invalid modifier group at index ${index}: maxSelect must be null or a non-negative number`);
    }
    if (maxSelect != null && minSelect > maxSelect) {
      throw new Error(`Invalid modifier group "${group?.name || index}": minSelect cannot be greater than maxSelect`);
    }
    if (required && minSelect < 1) {
      throw new Error(`Invalid modifier group "${group?.name || index}": required group must have minSelect of at least 1`);
    }

    const options = Array.isArray(group?.options)
      ? group.options.map((option) => ({
          name: option?.name || '',
          price: Number(option?.price ?? 0),
          isAvailable: option?.isAvailable !== false,
          isDefault: Boolean(option?.isDefault),
          _id: option?._id,
        }))
      : [];

    // Exactly one default per group. Two defaults leaves the menu quoting
    // whichever the client happens to read first, and none leaves a required
    // group with nothing selected.
    const defaults = options.filter((option) => option.isDefault);
    if (defaults.length !== 1 && options.length) {
      const chosen = defaults[0] || options[0];
      options.forEach((option) => {
        option.isDefault = option === chosen;
      });
    }

    return {
      _id: group?._id,
      name: group?.name || '',
      required,
      minSelect,
      maxSelect,
      priceMode: group?.priceMode === 'absolute' ? 'absolute' : 'surcharge',
      options,
    };
  });
};



