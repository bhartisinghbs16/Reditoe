import User from '../models/User.js';
import mongoose from 'mongoose';
import { getKycDisplayStatus } from '../utils/kycStatus.js';

/**
 * Get rider profile information with all fields
 * GET /api/rider/profile
 */
export const getRiderProfile = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login again.',
      });
    }

    // Validate riderId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid ID format (must be a valid MongoDB ObjectId)',
      });
    }

    // Get rider profile with all fields
    const rider = await User.findById(riderId).select('+phone +riderId +vehicleName +vehicleNumber +currentRating +dateOfBirth +gender +emergencyContactName +emergencyRelationship +emergencyContactPhone +bankDetails +vehicleType +vehicleBrand +vehicleModel +address +city +landmark +state +pincode');

    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider profile not found',
      });
    }
    
    // Get rider stats
    const stats = await getRiderStatsData(riderId);
    
    res.status(200).json({
      status: 'success',
      data: {
        profile: {
          // Basic Info
          name: rider.name,
          email: rider.email,
          phone: rider.phone,
          riderId: rider.riderId || `RID-${rider._id.toString().slice(-6)}`,
          
          // Personal Details
          dateOfBirth: rider.dateOfBirth,
          gender: rider.gender ? rider.gender.charAt(0).toUpperCase() + rider.gender.slice(1) : null,
          emergencyContactName: rider.emergencyContactName,
          emergencyRelationship: rider.emergencyRelationship,
          emergencyContactPhone: rider.emergencyContactPhone,
          
          /*
           * The vehicle, flat as well as nested.
           *
           * Only `vehicleInfo` was sent, and the app reads vehicleType,
           * vehicleName and vehicleNumber at the top level - so the Vehicle
           * Details screen showed nothing at all for riders whose vehicle was
           * sitting in the database. The nested object stays for anything
           * else already reading it.
           */
          vehicleType: rider.vehicleType || null,
          vehicleName: rider.vehicleName || null,
          vehicleNumber: rider.vehicleNumber || null,
          vehicleBrand: rider.vehicleBrand || null,
          vehicleModel: rider.vehicleModel || null,
          insuranceNumber: rider.insuranceNumber || null,

          // Where they live, and where post should go.
          address: rider.address || null,
          city: rider.city || null,
          landmark: rider.landmark || null,
          state: rider.state || null,
          pincode: rider.pincode || null,
          communicationAddress: rider.communicationAddress || null,

          // Vehicle Info
          vehicleInfo: rider.vehicleName || rider.vehicleNumber ? {
            model: rider.vehicleName,
            plateNumber: rider.vehicleNumber,
            type: rider.vehicleType,
            brand: rider.vehicleBrand || '',
            vehicleModel: rider.vehicleModel || ''
          } : null,
          
          // Bank Details
          bankDetails: rider.bankDetails,
          
          // Documents
          kycDocuments: rider.kycDocuments || {},
          
          // Performance
          currentRating: rider.currentRating || 0,
          kycStatus: rider.kycStatus || 'pending',
          kycDisplayStatus: getKycDisplayStatus(rider.kycStatus),
          isProfileComplete: rider.isProfileComplete || false,
        },
        stats: stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch rider profile',
    });
  }
};

/**
 * Get rider stats data
 */
const getRiderStatsData = async (riderId) => {
  try {
    const Order = mongoose.model('Order');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [active, completed, cancelled, todayOrders] = 
      await Promise.all([
        Order.countDocuments({ 
          riderId, 
          status: 'OnWay' 
        }),
        Order.countDocuments({ 
          riderId, 
          status: 'Delivered' 
        }),
        Order.countDocuments({ 
          riderId, 
          status: 'RiderRejected' 
        }),
        Order.find({ 
          riderId, 
          status: 'Delivered',
          createdAt: { $gte: today, $lte: todayEnd }
        }).select('total paymentMethod'),
      ]);

    const todayEarnings = todayOrders.reduce(
      (sum, o) => sum + (o.total || 0), 0
    );
    const todayCashCollected = todayOrders
      .filter((o) => String(o.paymentMethod || '').toLowerCase() === 'cod')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    return {
      active,
      completed,
      cancelled,
      todayEarnings,
      todayCashCollected,
    };
  } catch (error) {
    console.error('Error fetching rider stats:', error);
    return {
      active: 0,
      completed: 0,
      cancelled: 0,
      todayEarnings: 0,
      todayCashCollected: 0,
    };
  }
};
