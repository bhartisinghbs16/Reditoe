import mongoose from 'mongoose';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import Order from '../../models/Order.js';

// Global search for Vendors, Riders, and Users
export const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    
    // Allow absolutely any input - even empty strings
    const query = q ? q.trim() : '';
    
    // Only create regex if query is not empty to avoid invalid regex errors
    const searchRegex = query ? new RegExp(query, 'i') : new RegExp('.*', 'i');

    // Enhanced search for Vendors (Restaurant owners with role 'vendor')
    let vendorSearchConditions = [
      { name: searchRegex },
      { 'owner.email': searchRegex },
      { 'owner.phone': searchRegex },
      { 'owner.name': searchRegex }
    ];
    
    // Add ObjectId search only if valid (to avoid regex errors on ObjectId fields)
    if (mongoose.Types.ObjectId.isValid(query)) {
      vendorSearchConditions.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    
    const vendors = await Restaurant.find({
      $or: vendorSearchConditions
    })
    .populate('owner', 'name email phone')
    .limit(10)
    .lean()
    .catch(err => {      return [];
    });

    // Enhanced search for Riders (Users with role 'rider' and riderId)
    let riderSearchConditions = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { riderId: searchRegex }
    ];
    
    // Add ObjectId search only if valid (to avoid regex errors on ObjectId fields)
    if (mongoose.Types.ObjectId.isValid(query)) {
      riderSearchConditions.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    
    const riders = await User.find({
      role: 'rider',
      $or: riderSearchConditions
    })
    .select('name email riderId phone currentRating isOnline')
    .limit(10)
    .lean()
    .catch(err => {      return [];
    });

    // Enhanced search for Users (all roles EXCEPT riders - user, admin, vendor)
    let userSearchConditions = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { riderId: searchRegex }
    ];
    
    // Add ObjectId search only if valid (to avoid regex errors on ObjectId fields)
    if (mongoose.Types.ObjectId.isValid(query)) {
      userSearchConditions.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    
    const users = await User.find({
      role: { $in: ['user', 'admin', 'vendor'] }, // Exclude riders to avoid duplicates
      $or: userSearchConditions
    })
    .select('name email riderId phone role walletBalance')
    .limit(10)
    .lean()
    .catch(err => {      return [];
    });

    // Format results
    const results = [];

    // Add vendor results
    vendors.forEach(vendor => {
      if (vendor.owner) {
        results.push({
          id: vendor._id.toString(), // Use restaurant._id for routing
          name: vendor.name,
          email: vendor.owner.email,
          type: 'Vendor',
          displayName: vendor.name,
          subText: `ID: ${vendor._id.toString()} • ${vendor.owner.email}`,
          url: `/admin/vendors/${vendor._id}`
        });
      }
    });

    // Add rider results
    riders.forEach(rider => {
      results.push({
        id: rider.riderId || rider._id.toString(),
        name: rider.name,
        email: rider.email,
        type: 'Rider',
        displayName: rider.name,
        subText: `ID: ${rider.riderId || rider._id.toString()} • ${rider.email}`,
        url: `/admin/riders/${rider._id}`
      });
    });

    // Add user results
    users.forEach(user => {
      // Determine user type based on role (riders are handled separately above)
      let userType = 'User';
      
      if (user.role === 'admin') {
        userType = 'Admin';
      } else if (user.role === 'vendor') {
        userType = 'Vendor';
      }
      // Note: riders are excluded from users query, so no need to handle rider role here
      
      results.push({
        id: user.riderId || user._id.toString(),
        name: user.name,
        email: user.email,
        type: userType,
        displayName: user.name,
        subText: `ID: ${user.riderId || user._id.toString()} • ${user.email}`,
        url: `/admin/${userType.toLowerCase()}s/${user._id}`
      });
    });

    /**
     * Orders, which were not searched at all.
     *
     * An admin looking something up is usually holding an order number a
     * customer has read out - it is the single most likely thing to be typed
     * into this box, and it returned nothing however exactly it was spelled.
     */
    if (query) {
      const orders = await Order.find({
        $or: [
          { orderNumber: searchRegex },
          ...(mongoose.Types.ObjectId.isValid(query)
            ? [{ _id: new mongoose.Types.ObjectId(query) }]
            : []),
        ],
      })
        .populate('userId', 'name')
        .select('orderNumber status total createdAt userId')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .catch(() => []);

      orders.forEach((order) => {
        results.unshift({
          id: order._id.toString(),
          name: order.orderNumber,
          type: 'Order',
          displayName: order.orderNumber || order._id.toString().slice(-6),
          subText: `${order.status}${order.total ? ` • Rs ${Math.round(order.total)}` : ''}${
            order.userId?.name ? ` • ${order.userId.name}` : ''
          }`,
          url: `/admin/orders/${order._id}`,
        });
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        query,
        results,
        total: results.length
      }
    });

  } catch (error) {    res.status(500).json({
      status: 'error',
      message: 'Search failed. Please try again.'
    });
  }
};

// Search by exact ID for direct navigation
export const searchById = async (req, res) => {
  try {
    const { id } = req.params;
    const trimmedId = id.trim();

    if (!trimmedId) {
      return res.status(400).json({
        status: 'error',
        message: 'ID is required'
      });
    }

    let result = null;
    let entityType = null;

    // First try to find by MongoDB ObjectId (works for all entity types)
    if (mongoose.Types.ObjectId.isValid(trimmedId)) {
      // Try Restaurant collection first for vendors
      const restaurant = await Restaurant.findOne({ _id: trimmedId })
        .populate('owner', 'name email role')
        .lean();

      if (restaurant && restaurant.owner) {
        const result = {
          id: restaurant._id.toString(),
          name: restaurant.name,
          email: restaurant.owner.email,
          type: 'Vendor',
          url: `/admin/vendors/${restaurant._id}`
        };
        return res.status(200).json({
          status: 'success',
          data: result
        });
      }

      // Try User collection for riders and users
      const user = await User.findOne({ _id: trimmedId })
        .select('name email role riderId phone')
        .lean();

      if (user) {
        let url = '';
        let type = '';
        
        if (user.role === 'rider') {
          url = `/admin/riders/${user._id}`;
          type = 'Rider';
        } else {
          url = `/admin/users/${user._id}`;
          type = 'User';
        }

        const result = {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          type: type,
          url: url
        };
        return res.status(200).json({
          status: 'success',
          data: result
        });
      }
    }

    // If not found by ObjectId, try searching by riderId
    const user = await User.findOne({ riderId: trimmedId })
      .select('name email role riderId phone')
      .lean();

    if (user) {
      let url = '';
      let type = '';
      
      if (user.role === 'rider') {
        url = `/admin/riders/${user._id}`;
        type = 'Rider';
        const result = {
          id: user.riderId,
          name: user.name,
          email: user.email,
          type: type,
          url: url
        };
        return res.status(200).json({
          status: 'success',
          data: result
        });
      }
    }

    // If still not found, return 404
    return res.status(404).json({
      status: 'error',
      message: `No record found for ID: ${trimmedId}`
    });

  } catch (error) {    res.status(500).json({
      status: 'error',
      message: 'Search failed. Please try again.'
    });
  }
};
