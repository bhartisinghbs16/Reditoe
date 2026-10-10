/**
 * Validation middleware for delivery boy operations
 */
import mongoose from 'mongoose';

/**
 * Validate delivery boy creation/update data
 */
export const validateDeliveryBoyData = (req, res, next) => {
  const {
    name,
    phone,
    email,
    password,
    commissionType,
    commissionValue,
    vehicleNumber,
    bankName,
    accountNumber,
    ifsc,
    accountHolderName,
    upiId,
    pincode,
    vendorId
  } = req.body;

  const errors = [];

  // Basic info validation
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    errors.push('Name must be at least 2 characters long');
  }

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    errors.push('Valid 10-digit phone number is required');
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('Valid email address is required');
  }

  if (password && password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  // Commission validation
  if (!commissionType || !['percentage', 'fixed'].includes(commissionType)) {
    errors.push('Commission type must be either percentage or fixed');
  }

  if (commissionValue === undefined || isNaN(commissionValue) || commissionValue < 0) {
    errors.push('Commission value must be a positive number');
  }

  if (commissionType === 'percentage' && commissionValue > 100) {
    errors.push('Percentage commission cannot exceed 100');
  }

  // Vehicle validation (optional)
  if (vehicleNumber && typeof vehicleNumber !== 'string') {
    errors.push('Vehicle number must be a string');
  }

  // Bank details validation (optional but if provided, must be valid)
  if (bankName && typeof bankName !== 'string') {
    errors.push('Bank name must be a string');
  }

  if (accountNumber && (!/^\d+$/.test(accountNumber) || accountNumber.length < 9)) {
    errors.push('Account number must contain only digits and be at least 9 digits');
  }

  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    errors.push('IFSC code must be in format: ABCD0XXXXXX');
  }

  if (accountHolderName && typeof accountHolderName !== 'string') {
    errors.push('Account holder name must be a string');
  }

  if (upiId && !/^[\w.-]+@[\w.-]+$/.test(upiId)) {
    errors.push('UPI ID must be in format: username@provider');
  }

  // Address validation (optional)
  if (pincode && (!/^\d{6}$/.test(pincode))) {
    errors.push('Pincode must be a 6-digit number');
  }

  // Vendor ID validation (for admin routes)
  if (vendorId && !mongoose.Types.ObjectId.isValid(vendorId)) {
    errors.push('Valid vendor ID is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate delivery boy ID in params
 */
export const validateDeliveryBoyId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid delivery boy ID is required',
    });
  }

  next();
};

/**
 * Validate vendor ID in params
 */
export const validateVendorId = (req, res, next) => {
  const { vendorId } = req.params;

  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid vendor ID is required',
    });
  }

  next();
};

/**
 * Validate status update
 */
export const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;

  if (!status || !['active', 'inactive'].includes(status)) {
    return res.status(400).json({
      status: 'error',
      message: 'Status must be either active or inactive',
    });
  }

  next();
};

/**
 * Validate online status update
 */
export const validateOnlineStatusUpdate = (req, res, next) => {
  const { isOnline } = req.body;

  if (isOnline === undefined || typeof isOnline !== 'boolean') {
    return res.status(400).json({
      status: 'error',
      message: 'isOnline must be a boolean value',
    });
  }

  next();
};

/**
 * Validate file upload for delivery boy documents
 */
export const validateDeliveryBoyFileUpload = (req, res, next) => {
  const { category } = req.body;

  const allowedCategories = [
    'profile',
    'vehicle',
    'vehicle_rc',
    'license',
    'cancel_cheque',
    'document'
  ];

  if (!category || !allowedCategories.includes(category)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid file category is required',
      allowedCategories,
    });
  }

  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      message: 'No file uploaded',
    });
  }

  // Check file size (max 10MB)
  if (req.file.size > 10 * 1024 * 1024) {
    return res.status(400).json({
      status: 'error',
      message: 'File size cannot exceed 10MB',
    });
  }

  // Check file type
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      status: 'error',
      message: 'Only JPEG, PNG, GIF, WebP images and PDF files are allowed',
    });
  }

  next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page && (isNaN(page) || parseInt(page) < 1)) {
    return res.status(400).json({
      status: 'error',
      message: 'Page must be a positive integer',
    });
  }

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return res.status(400).json({
      status: 'error',
      message: 'Limit must be between 1 and 100',
    });
  }

  next();
};

/**
 * Validate delivery boy login credentials
 */
export const validateDeliveryBoyLogin = (req, res, next) => {
  const { phone, password, otp } = req.body;

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid 10-digit phone number is required',
    });
  }

  if (!password && !otp) {
    return res.status(400).json({
      status: 'error',
      message: 'Either password or OTP is required for login',
    });
  }

  if (otp && (!/^\d{6}$/.test(otp))) {
    return res.status(400).json({
      status: 'error',
      message: 'OTP must be a 6-digit number',
    });
  }

  next();
};

/**
 * Validate OTP generation request
 */
export const validateOTPRequest = (req, res, next) => {
  const { phone } = req.body;

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid 10-digit phone number is required',
    });
  }

  next();
};
