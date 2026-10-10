/**
 * Vendor Delivery Boy Controller
 * Vendors can only manage their own delivery boys
 */
import DeliveryBoy from '../../models/DeliveryBoy.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

/**
 * GET /api/vendor/delivery-boys/my - Get vendor's delivery boys
 */
export const getMyDeliveryBoys = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in
    const { status, isOnline } = req.query;

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    const filter = { vendorId: restaurant._id };
    if (status && ['active', 'inactive'].includes(status)) {
      filter.status = status;
    }
    if (isOnline !== undefined) {
      filter.isOnline = isOnline === 'true';
    }

    const deliveryBoys = await DeliveryBoy.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      results: deliveryBoys.length,
      data: {
        deliveryBoys,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch delivery boys',
    });
  }
};

/**
 * POST /api/vendor/delivery-boys/create - Create new delivery boy
 */
export const createMyDeliveryBoy = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in
    const {
      name,
      phone,
      email,
      password,
      vehicleNumber,
      fullAddress,
      pincode,
      bankName,
      accountNumber,
      ifsc,
      accountHolderName,
      upiId,
      otpLoginEnabled = false,
      ...otherData
    } = req.body;

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    // Validate required fields
    if (!name || !phone || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, phone, and password are required',
      });
    }

    // Check if phone already exists
    const existingDeliveryBoy = await DeliveryBoy.findOne({ phone });
    if (existingDeliveryBoy) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number already exists',
      });
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmailDeliveryBoy = await DeliveryBoy.findOne({ email });
      if (existingEmailDeliveryBoy) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already exists',
        });
      }
    }

    // Use restaurant's commission settings as default
    const deliveryBoyData = {
      vendorId: restaurant._id,
      name,
      phone,
      password,
      commissionType: 'percentage', // Default to percentage
      commissionValue: restaurant.commissionPercent || 10, // Use restaurant's commission
      otpLoginEnabled,
      ...otherData,
    };

    // Add optional fields
    if (email) deliveryBoyData.email = email;
    if (vehicleNumber) deliveryBoyData.vehicleNumber = vehicleNumber;
    if (fullAddress) deliveryBoyData.fullAddress = fullAddress;
    if (pincode) deliveryBoyData.pincode = pincode;
    if (bankName) deliveryBoyData.bankName = bankName;
    if (accountNumber) deliveryBoyData.accountNumber = accountNumber;
    if (ifsc) deliveryBoyData.ifsc = ifsc;
    if (accountHolderName) deliveryBoyData.accountHolderName = accountHolderName;
    if (upiId) deliveryBoyData.upiId = upiId;

    const deliveryBoy = await DeliveryBoy.create(deliveryBoyData);

    // Populate vendor details
    await deliveryBoy.populate('vendorId', 'name phone');

    res.status(201).json({
      status: 'success',
      message: 'Delivery boy created successfully',
      data: {
        deliveryBoy,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create delivery boy',
    });
  }
};

/**
 * GET /api/vendor/delivery-boys/:id - Get single delivery boy (vendor's own)
 */
export const getMyDeliveryBoyById = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ 
      _id: id, 
      vendorId: restaurant._id 
    }).populate('vendorId', 'name phone');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found or access denied',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        deliveryBoy,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch delivery boy',
    });
  }
};

/**
 * PUT /api/vendor/delivery-boys/:id - Update delivery boy (vendor's own)
 */
export const updateMyDeliveryBoy = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in
    const { id } = req.params;
    const updateData = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    // Remove sensitive/restricted fields
    const { 
      _id, 
      createdAt, 
      updatedAt, 
      totalDeliveries, 
      completedDeliveries,
      vendorId: restrictedVendorId, // Vendors cannot change vendorId
      commissionType, // Vendors cannot change commission type set by admin
      commissionValue, // Vendors cannot change commission value set by admin
      ...allowedUpdates 
    } = updateData;

    // If updating phone, check for duplicates
    if (allowedUpdates.phone) {
      const existingDeliveryBoy = await DeliveryBoy.findOne({ 
        phone: allowedUpdates.phone,
        _id: { $ne: id }
      });
      if (existingDeliveryBoy) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number already exists',
        });
      }
    }

    // If updating email, check for duplicates
    if (allowedUpdates.email) {
      const existingEmailDeliveryBoy = await DeliveryBoy.findOne({ 
        email: allowedUpdates.email,
        _id: { $ne: id }
      });
      if (existingEmailDeliveryBoy) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already exists',
        });
      }
    }

    const deliveryBoy = await DeliveryBoy.findOneAndUpdate(
      { _id: id, vendorId: restaurant._id },
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate('vendorId', 'name phone');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found or access denied',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Delivery boy updated successfully',
      data: {
        deliveryBoy,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update delivery boy',
    });
  }
};

/**
 * PATCH /api/vendor/delivery-boys/:id/status - Update delivery boy status (vendor's own)
 */
export const updateMyDeliveryBoyStatus = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Status must be active or inactive',
      });
    }

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    const deliveryBoy = await DeliveryBoy.findOneAndUpdate(
      { _id: id, vendorId: restaurant._id },
      { status },
      { new: true, runValidators: true }
    ).populate('vendorId', 'name phone');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found or access denied',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Delivery boy ${status}`,
      data: {
        deliveryBoy,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update delivery boy status',
    });
  }
};

/**
 * GET /api/vendor/delivery-boys/available - Get available delivery boys for vendor
 */
export const getAvailableDeliveryBoys = async (req, res) => {
  try {
    const vendorId = req.user._id; // Assuming vendor is logged in

    // Find restaurant for this vendor
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found for this vendor',
      });
    }

    const availableDeliveryBoys = await DeliveryBoy.findAvailable(restaurant._id);

    res.status(200).json({
      status: 'success',
      results: availableDeliveryBoys.length,
      data: {
        deliveryBoys: availableDeliveryBoys,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch available delivery boys',
    });
  }
};
