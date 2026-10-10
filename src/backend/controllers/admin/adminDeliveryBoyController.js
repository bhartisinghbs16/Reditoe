/**
 * Admin Delivery Boy Controller
 * Full CRUD operations for delivery boys
 */
import DeliveryBoy from '../../models/DeliveryBoy.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

/**
 * GET /admin/delivery-boys - List all delivery boys with filtering
 */
export const getDeliveryBoys = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    
    const { vendorId, status, isOnline } = req.query;
    
    const filter = {};
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
      filter.vendorId = vendorId;
    }
    if (status && ['active', 'inactive'].includes(status)) {
      filter.status = status;
    }
    if (isOnline !== undefined) {
      filter.isOnline = isOnline === 'true';
    }

    const [deliveryBoys, total] = await Promise.all([
      DeliveryBoy.find(filter)
        .populate('vendorId', 'name phone owner')
        .populate('vendorId.owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryBoy.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: deliveryBoys.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
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
 * POST /admin/delivery-boys/create - Create new delivery boy
 */
export const createDeliveryBoy = async (req, res) => {
  try {
    const {
      vendorId,
      name,
      phone,
      email,
      password,
      commissionType,
      commissionValue,
      vehicleNumber,
      vehicleType = "bike",
      fullAddress,
      pincode,
      landmark,
      bankName,
      accountNumber,
      ifsc,
      accountHolderName,
      upiId,
      otpLoginEnabled = false,
      status = "pending",
      rating = 0,
      location,
      perKmCharge = 10,
      ...otherData
    } = req.body;

    // Validate required fields
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid vendor ID is required',
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and phone are required',
      });
    }

    // Check if vendor exists
    const vendor = await Restaurant.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendor not found',
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

    // Generate unique rider ID
    const riderId = `RIDER${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Create delivery boy with all required fields
    const deliveryBoyData = {
      vendorId,
      name,
      phone,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@temp.com`,
      password: password || "defaultPassword123",
      commissionType: commissionType || "percentage",
      commissionValue: commissionValue || 10,
      otpLoginEnabled,
      vehicleNumber: vehicleNumber || "Not specified",
      vehicleType: vehicleType || "bike",
      vehicleName: otherData.vehicleName || "Not specified",
      fullAddress: fullAddress || "Not provided",
      pincode: pincode || "000000",
      landmark: landmark || "",
      bankName: bankName || "Not provided",
      accountNumber: accountNumber || "Not provided",
      ifsc: ifsc || "Not provided",
      accountHolderName: accountHolderName || "Not provided",
      upiId: upiId || "",
      status: status || "pending",
      rating: parseFloat(rating) || 0,
      location: location || { type: "Point", coordinates: [0, 0] },
      
      // Required fields with defaults
      riderId,
      isOnline: false,
      kycStatus: "pending",
      perKmCharge: parseFloat(perKmCharge) || 10,
      totalDeliveries: 0,
      completedDeliveries: 0,
      cancelledDeliveries: 0,
      totalEarnings: 0,
      currentRating: parseFloat(rating) || 0,
      insuranceNumber: otherData.insuranceNumber || "Not available",
      
      // Initialize empty arrays and objects
      incentives: [],
      penalties: [],
      bankDetails: {
        accountHolderName: accountHolderName || "Not provided",
        accountNumber: accountNumber || "Not provided",
        ifsc: ifsc || "Not provided",
        bankName: bankName || "Not provided",
        branch: otherData.branch || "Not available",
        city: otherData.city || "Not available",
        country: "India"
      },
      kycDocuments: {
        aadhaar: null,
        drivingLicense: null,
        vehicleRC: null,
        selfie: null
      },
      currentLocation: null,
      currentOrderId: null,
      deliveryETA: null,
      
      ...otherData
    };

    const deliveryBoy = await DeliveryBoy.create(deliveryBoyData);

    // Populate vendor details
    await deliveryBoy.populate('vendorId', 'name phone owner');
    await deliveryBoy.populate('vendorId.owner', 'name email');

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
 * GET /admin/delivery-boys/:id - Get single delivery boy
 */
export const getDeliveryBoyById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(id)
      .populate('vendorId', 'name phone owner')
      .populate('vendorId.owner', 'name email');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found',
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
 * PUT /admin/delivery-boys/:id - Update delivery boy
 */
export const updateDeliveryBoy = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    // Remove sensitive fields that shouldn't be updated via this endpoint
    const { _id, createdAt, updatedAt, totalDeliveries, completedDeliveries, ...allowedUpdates } = updateData;

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

    // If updating vendorId, check if vendor exists
    if (allowedUpdates.vendorId) {
      const vendor = await Restaurant.findById(allowedUpdates.vendorId);
      if (!vendor) {
        return res.status(400).json({
          status: 'error',
          message: 'Vendor not found',
        });
      }
    }

    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      id,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate('vendorId', 'name phone owner')
     .populate('vendorId.owner', 'name email');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found',
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
 * PATCH /admin/delivery-boys/:id/status - Update delivery boy status
 */
export const updateDeliveryBoyStatus = async (req, res) => {
  try {
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

    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).populate('vendorId', 'name phone owner')
     .populate('vendorId.owner', 'name email');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found',
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
 * DELETE /admin/delivery-boys/:id - Delete delivery boy
 */
export const deleteDeliveryBoy = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found',
      });
    }

    // Check if delivery boy has active orders
    if (deliveryBoy.currentOrderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete delivery boy with active orders',
      });
    }

    await DeliveryBoy.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Delivery boy deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete delivery boy',
    });
  }
};

/**
 * GET /admin/delivery-boys/vendor/:vendorId - Get delivery boys by vendor
 */
export const getDeliveryBoysByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, isOnline } = req.query;

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid vendor ID',
      });
    }

    // Check if vendor exists
    const vendor = await Restaurant.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendor not found',
      });
    }

    const filter = { vendorId };
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
 * PATCH /admin/delivery-boys/:id/online-status - Toggle online status
 */
export const toggleOnlineStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery boy ID',
      });
    }

    if (isOnline === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'isOnline field is required',
      });
    }

    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      id,
      { isOnline },
      { new: true, runValidators: true }
    ).populate('vendorId', 'name phone owner')
     .populate('vendorId.owner', 'name email');

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Delivery boy not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Delivery boy is now ${isOnline ? 'online' : 'offline'}`,
      data: {
        deliveryBoy,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update online status',
    });
  }
};
