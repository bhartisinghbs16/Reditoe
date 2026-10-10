import Order from '../models/Order.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import RiderEarning from '../models/RiderEarning.js';
import mongoose from 'mongoose';
import riderBatchService from '../services/riderBatchService.js';
import { processReferralOnDeliveredOrder } from '../services/referralService.js';
import { processRiderEarnings } from '../services/riderEarningsService.js';
import notificationService from '../services/notificationService.js';
import {
  expireStaleDispatches,
  redispatchStrandedOrders,
  computeOrderDistanceFromRider,
} from '../services/riderDispatchService.js';
import websocketService from '../services/websocketService.js';
import { closeOrderCommunicationIfNeeded } from '../services/orderCommunicationLifecycleService.js';
import orderBroadcastService from '../services/orderBroadcastService.js';
import IncentiveService from '../services/incentiveService.js';
import { getKycDisplayStatus } from '../utils/kycStatus.js';

/**
 * Get rider profile information
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

    // Get rider profile
    const rider = await User.findById(riderId).select(
      '+phone +riderId +vehicleName +vehicleNumber +currentRating'
    );

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
        /*
         * The whole profile, not six fields of it.
         *
         * This returned name, email, phone, id, vehicle and rating and
         * nothing else, while the app reads a date of birth, an address, a
         * blood group, an emergency contact and more besides. Every one of
         * those came back undefined, which is why Personal Information showed
         * "Not Available" against a rider whose details were sitting in the
         * database all along.
         */
        profile: {
          name: rider.name,
          email: rider.email,
          phone: rider.phone,
          riderId: rider.riderId || `RID-${rider._id.toString().slice(-6)}`,
          currentRating: rider.currentRating || 0,

          dateOfBirth: rider.dateOfBirth || null,
          gender: rider.gender || null,
          bloodGroup: rider.bloodGroup || null,
          address: rider.address?.fullAddress || rider.address || null,
          fullAddress: rider.address?.fullAddress || null,
          city: rider.city || rider.address?.city || null,
          state: rider.state || rider.address?.state || null,

          emergencyContactName: rider.emergencyContactName || null,
          emergencyContactPhone: rider.emergencyContactPhone || null,
          emergencyRelationship: rider.emergencyRelationship || null,

          vehicleType: rider.vehicleType || null,
          vehicleName: rider.vehicleName || null,
          vehicleNumber: rider.vehicleNumber || null,
          insuranceNumber: rider.insuranceNumber || null,
          insuranceValidTill: rider.insuranceValidTill || null,
          vehicleInfo: rider.vehicleName || rider.vehicleNumber ? {
            model: rider.vehicleName,
            plateNumber: rider.vehicleNumber
          } : null,

          kycStatus: rider.kycStatus || 'pending',
          isBlocked: Boolean(rider.isBlocked),
          accountVerified: rider.accountVerified !== false,
          createdAt: rider.createdAt,
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
 * Update rider profile information
 * PUT /api/rider/profile
 */
export const updateRiderProfile = async (req, res) => {
  try {
    const riderId = req.riderId;
    const {
      name,
      vehicleName,
      vehicleNumber,
      // The rest of what the app's Edit buttons offer. Only name and the two
      // vehicle fields were accepted, so a rider could change nothing else -
      // including the emergency contact, which is the one somebody would need
      // if anything happened to them mid-shift.
      bloodGroup,
      gender,
      emergencyContactName,
      emergencyContactPhone,
      emergencyRelationship,
      address,
      city,
      state,
    } = req.body;

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

    /*
     * A partial update is allowed.
     *
     * Every field here was optional except the name, which the endpoint
     * demanded on every call - so a rider saving only their emergency contact
     * was told "Name is required" and nothing was saved. A name that is sent
     * still has to be a real one; one that is not sent is simply left alone.
     */
    if (name !== undefined && String(name).trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Name cannot be empty',
      });
    }

    // Find and update rider profile
    const updateData = {};
    if (name !== undefined) {
      updateData.name = String(name).trim();
    }

    // Add vehicle fields if provided
    if (vehicleName !== undefined) {
      updateData.vehicleName = vehicleName.trim();
    }
    if (vehicleNumber !== undefined) {
      updateData.vehicleNumber = vehicleNumber.trim();
    }

    /*
     * The rest of the profile.
     *
     * Email and phone are deliberately not here: they identify the account at
     * sign-in and were verified by a code, so changing one from this screen
     * would undo that quietly. Those go through support.
     */
    const optional = {
      bloodGroup,
      gender,
      emergencyContactName,
      emergencyRelationship,
      city,
      state,
    };
    for (const [field, value] of Object.entries(optional)) {
      if (value !== undefined) updateData[field] = String(value).trim();
    }

    if (emergencyContactPhone !== undefined) {
      const digits = String(emergencyContactPhone).replace(/\D/g, '').slice(-10);
      if (digits && !/^[6-9]\d{9}$/.test(digits)) {
        return res.status(400).json({
          status: 'error',
          message: 'Enter a valid 10-digit emergency contact number.',
        });
      }
      updateData.emergencyContactPhone = digits;
    }

    if (address !== undefined) {
      // Merged, so setting a street does not wipe the city and state beside it.
      updateData['address.fullAddress'] = String(address).trim();
    }

    const rider = await User.findByIdAndUpdate(
      riderId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('+phone +riderId +vehicleName +vehicleNumber +currentRating');

    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider profile not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        id: rider._id,
        name: rider.name,
        email: rider.email,
        phone: rider.phone,
        riderId: rider.riderId,
        vehicleName: rider.vehicleName,
        vehicleNumber: rider.vehicleNumber,
        currentRating: rider.currentRating,
        avatar: rider.avatar,
        isOnline: rider.isOnline,
        kycStatus: rider.kycStatus,
        kycDisplayStatus: getKycDisplayStatus(rider.kycStatus),
      },
    });
  } catch (error) {
    console.error('Error updating rider profile:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile',
    });
  }
};

/**
 * Confirm COD payment collection
 * PATCH /api/rider/orders/:orderId/confirm-cod
 */
export const confirmCodPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId = req.riderId;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Verify rider has access
    if (!order.riderId || order.riderId.toString() !== riderId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. This order is not assigned to you.',
      });
    }

    // Only allow COD orders
    if (order.paymentMethod !== 'cod') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment confirmation is only applicable for COD orders',
      });
    }

    // Do not allow double-confirmation
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment is already marked as collected',
      });
    }

    // Mark payment as collected
    order.paymentStatus = 'paid';
    order.timeline.push({
      status: 'PaymentCollected',
      timestamp: new Date(),
      message: 'COD payment collected by rider',
    });

    await order.save();

    return res.status(200).json({
      status: 'success',
      message: 'COD payment confirmed',
      data: {
        order: {
          id: order._id.toString(),
          paymentStatus: order.paymentStatus,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to confirm COD payment',
    });
  }
};

/**
 * Get rider stats data (helper function)
 */
const getRiderStatsData = async (riderId) => {
  try {
    // Get all orders for this rider
    const allOrders = await Order.find({ riderId });
    
    // Calculate stats
    const totalDeliveries = allOrders.filter(order => order.status === 'Delivered').length;
    const assignedOrders = allOrders.length;
    const successRate = assignedOrders > 0 ? (totalDeliveries / assignedOrders) * 100 : 0;
    
    // Calculate earnings (assuming order has deliveryFee field)
    const totalEarnings = allOrders
      .filter(order => order.status === 'Delivered')
      .reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
    
    // Get average rating from rider profile
    const rider = await User.findById(riderId);
    const avgRating = rider?.currentRating || 0;
    
    return {
      totalDeliveries,
      assignedOrders,
      successRate: Math.round(successRate * 10) / 10,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      avgRating: avgRating > 0 ? Math.round(avgRating * 10) / 10 : 4.8,
    };
  } catch (error) {
    return {
      totalDeliveries: 12,
      assignedOrders: 15,
      successRate: 80.0,
      totalEarnings: 2450.50,
      avgRating: 4.8,
    };
  }
};

/**
 * Get available orders for riders (orders with status 'Ready' that are not assigned)
 * GET /api/rider/orders/available
 */
/**
 * Trigger order broadcasting for available orders
 * This would be called when new orders become available
 */
export const triggerOrderBroadcast = async (req, res) => {
  try {
    // Get orders that are ready for dispatch
    const orders = await Order.find({
      status: 'Ready',
      dispatchState: 'pending',
      riderId: { $exists: false },
      candidateRiderIds: { $exists: false }
    }).populate('restaurantId', 'name address');

    // Broadcast each order to available riders
    for (const order of orders) {
      await orderBroadcastService.broadcastOrder(order);
    }

    res.status(200).json({
      status: 'success',
      message: `Broadcasted ${orders.length} orders to available riders`,
      data: {
        ordersBroadcasted: orders.length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to trigger order broadcast',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

const buildAvailableOrdersQuery = (riderId, now = new Date()) => ({
  status: 'Ready',
  dispatchState: 'pending',
  candidateRiderIds: new mongoose.Types.ObjectId(riderId),
  dispatchExpiresAt: { $gt: now },
  $or: [
    { riderId: null },
    { riderId: { $exists: false } },
  ],
  $and: [
    {
      $or: [
        { assignedAt: null },
        { assignedAt: { $exists: false } },
      ],
    },
  ],
});

export const getAvailableOrders = async (req, res) => {
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

    // Verify rider exists
    const rider = await User.findById(riderId);

    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider profile not found',
      });
    }
    
    await expireStaleDispatches();
    // Revive anything Ready that no rider is coming for. Without this a
    // single failed dispatch strands the order for good.
    await redispatchStrandedOrders();
    // Get orders with status 'Ready' that are not assigned to any rider
    
    const query = buildAvailableOrdersQuery(riderId);
    
    // Try the query
    let orders = await Order.find(query)
      .populate('restaurantId', 'name address phone')
      .populate('userId', 'name phone email')
      .populate('items.foodItemId', 'name image price')
      .sort({ createdAt: -1 })
      .limit(50);

    // Format orders for rider dashboard
    const formattedOrders = orders.map((order) => {
      const distanceKm = computeOrderDistanceFromRider(order, rider);

      // Get first food item name for display
      const firstItem = order.items[0];
      const foodItemName = firstItem?.name || firstItem?.foodItemId?.name || 'Food Items';

      // Calculate item count
      const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

      // Format restaurant address - handle both string and object
      let restaurantAddressStr = 'Address not available';
      const restaurantAddress = order.restaurantId?.address;
      if (typeof restaurantAddress === 'string') {
        restaurantAddressStr = restaurantAddress;
      } else if (restaurantAddress && typeof restaurantAddress === 'object') {
        // If address is an object, format it
        const addr = restaurantAddress;
        restaurantAddressStr = [
          addr.street,
          addr.city,
          addr.state,
          addr.zipCode
        ].filter(Boolean).join(', ') || 'Address not available';
      }

      const restaurantCoordinates = order.restaurantId?.address?.coordinates;
      const restaurantLatitude = Number(restaurantCoordinates?.latitude);
      const restaurantLongitude = Number(restaurantCoordinates?.longitude);
      const hasRestaurantCoordinates =
        Number.isFinite(restaurantLatitude) && Number.isFinite(restaurantLongitude);

      return {
        id: order._id.toString(),
        orderId: order.orderNumber || deriveOrderNumberFromId(order._id),
        orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
        foodItem: foodItemName,
        restaurantAddress: restaurantAddressStr,
        restaurantName: order.restaurantId?.name || 'Restaurant',
        restaurantLatitude: hasRestaurantCoordinates ? restaurantLatitude : null,
        restaurantLongitude: hasRestaurantCoordinates ? restaurantLongitude : null,
        distanceKm: distanceKm ?? null,
        distance: distanceKm != null ? `${distanceKm} km` : 'N/A',
        deliveryFee: order.deliveryFee,
        status: order.status,
        dispatchState: order.dispatchState || null,
        dispatchExpiresAt: order.dispatchExpiresAt || null,
        timeLeftSeconds: order.dispatchExpiresAt ? Math.max(0, Math.floor((new Date(order.dispatchExpiresAt).getTime() - Date.now()) / 1000)) : 0,
        total: order.total,
        itemCount,
        customerName: order.userId?.name || 'Customer',
        customerPhone: order.userId?.phone || '',
        deliveryAddress: order.deliveryAddress,
        createdAt: order.createdAt,
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch available orders',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

export const getAvailableOrdersCount = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login again.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid ID format (must be a valid MongoDB ObjectId)',
      });
    }

    await expireStaleDispatches();
    // Revive anything Ready that no rider is coming for. Without this a
    // single failed dispatch strands the order for good.
    await redispatchStrandedOrders();
    const count = await Order.countDocuments(buildAvailableOrdersQuery(riderId));

    return res.status(200).json({
      status: 'success',
      data: { count },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch available order count',
    });
  }
};

/**
 * Accept an order (assign rider to order and update status to 'OnWay')
 * PATCH /api/rider/orders/:orderId/accept
 */
export const acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId = req.riderId;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID is required',
      });
    }

    // Check if rider is online
    const rider = await User.findById(riderId);
    if (!rider || !rider.isOnline) {
      return res.status(403).json({
        status: 'error',
        message: 'You must be online to accept orders',
      });
    }

    const now = new Date();
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: 'Ready',
        dispatchState: 'pending',
        dispatchExpiresAt: { $gt: now },
        candidateRiderIds: new mongoose.Types.ObjectId(riderId),
        $or: [{ riderId: null }, { riderId: { $exists: false } }],
      },
      {
        /**
         * Accepting claims the order; it does not collect it.
         *
         * This used to set 'OnWay' here, which reported the food as out for
         * delivery while it was still on the counter and skipped the pickup
         * check entirely — the rider was "on the way" before meeting the
         * vendor. The order stays 'Ready' until the pickup code is verified,
         * which is what moves it to 'OnWay'.
         */
        $set: {
          riderId: new mongoose.Types.ObjectId(riderId),
          dispatchState: 'assigned',
          assignedAt: now,
          /**
           * Last stop of whatever the rider is already carrying.
           *
           * A rider can hold several orders at once, and the customer is told
           * where theirs sits in that run. A new acceptance goes to the back
           * rather than ahead of customers who were quoted a time first.
           */
          stopIndex: await riderBatchService.nextStopIndex(riderId),
        },
        $push: {
          timeline: {
            status: 'Ready',
            timestamp: now,
            message: 'Order accepted by rider — heading to the restaurant',
          },
          assignmentHistory: {
            riderId: new mongoose.Types.ObjectId(riderId),
            assignedAt: now,
            assignedBy: new mongoose.Types.ObjectId(riderId),
            assignmentType: 'auto',
            notes: 'Auto dispatch accept (first accept wins)',
          },
        },
      },
      { new: true }
    );
    if (!order) {
      return res.status(409).json({
        status: 'error',
        code: 'ORDER_ALREADY_ASSIGNED',
        message: 'Order already assigned or request expired',
      });
    }
    websocketService.emitOrderLifecycle({
      order,
      eventName: 'order_assigned',
      source: 'rider',
      userId: order.userId ? String(order.userId) : null,
      riderId: riderId ? String(riderId) : null,
      candidateRiderIds: order.candidateRiderIds || [],
    });

    // Notify other riders that this order was taken
    orderBroadcastService.notifyOrderAssigned(order._id.toString(), riderId);

    // Notify rider — order accepted
    try {
      await notificationService.storeNotification(
        riderId,
        {
          title: 'Order Accepted',
          body: `You accepted order ${order.orderNumber || deriveOrderNumberFromId(order._id)}. Head to restaurant for pickup.`,
          type: 'order',
          data: { orderId: order._id.toString(), type: 'order_accepted' },
        },
        'DeliveryBoy'
      );
    } catch (e) {
      console.error('Notification error:', e.message);
    }

    // Populate order data for response
    await order.populate('restaurantId', 'name address phone');
    await order.populate('userId', 'name phone email');
    await order.populate('items.foodItemId', 'name image price');

    res.status(200).json({
      status: 'success',
      message: 'Order accepted successfully',
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderNumber || deriveOrderNumberFromId(order._id),
          orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
          status: order.status,
          dispatchState: order.dispatchState,
          restaurant: order.restaurantId,
          customer: order.userId,
          items: order.items,
          deliveryAddress: order.deliveryAddress,
          deliveryFee: order.deliveryFee,
          total: order.total,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to accept order',
    });
  }
};

export const rejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId = req.riderId;

    let order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    if (order.riderId && order.riderId.toString() !== riderId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not assigned to this order',
      });
    }

    /**
     * One rider declining is not the order being cancelled.
     *
     * This used to set the whole order to RiderRejected, which ended the
     * customer's order because one delivery partner was busy - and it left
     * that rider on the candidate list, so dispatch offered it to them again
     * a few seconds later, over and over. That is the "same request keeps
     * coming back" fault.
     *
     * Declining now removes this rider from the offer and leaves the order
     * where it was, so another rider can take it. The order only stops being
     * offered when it is accepted or the restaurant cancels it.
     */
    const wasAssigned =
      order.riderId && order.riderId.toString() === riderId.toString();

    const declineUpdate = await Order.findOneAndUpdate(
      { _id: order._id },
      {
        $pull: { candidateRiderIds: new mongoose.Types.ObjectId(riderId) },
        $addToSet: { declinedRiderIds: new mongoose.Types.ObjectId(riderId) },
        $push: {
          timeline: {
            status: order.status,
            timestamp: new Date(),
            message: 'A delivery partner declined; looking for another',
          },
        },
        // An order that had been claimed goes back to the pool rather than
        // staying attached to somebody who has said no.
        ...(wasAssigned
          ? { $set: { riderId: null, dispatchState: 'pending' } }
          : {}),
      },
      { new: true }
    );

    /**
     * Not saved afterwards.
     *
     * `order` was read before the update above and knows nothing about it;
     * calling save() on it would write the stale copy straight back over the
     * decline that was just recorded. The updated document is used from here
     * on instead.
     */
    if (declineUpdate) order = declineUpdate;
    await closeOrderCommunicationIfNeeded(order._id);
    websocketService.emitOrderLifecycle({
      order,
      eventName: 'order_declined',
      source: 'rider',
      userId: order.userId ? String(order.userId) : null,
      riderId: riderId ? String(riderId) : null,
    });

    // Notify rider — order rejected
    try {
      await notificationService.storeNotification(
        riderId,
        {
          title: 'Order Rejected',
          body: `You rejected order #${order.orderId || order._id.toString().slice(-6)}.`,
          type: 'order',
          data: { orderId: order._id.toString(), type: 'order_rejected' },
        },
        'DeliveryBoy'
      );
    } catch (e) {
      console.error('Notification error:', e.message);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Order declined. It will be offered to another delivery partner.',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reject order',
    });
  }
};

/**
 * Get rider's assigned orders
 * GET /api/rider/orders
 */
/**
 * The run the rider is on: everything they are carrying, first stop first.
 *
 * GET /api/rider/run
 */
export const getRiderRun = async (req, res) => {
  try {
    const run = await riderBatchService.runFor(req.riderId);
    return res.status(200).json({
      status: 'success',
      data: {
        totalStops: run.length,
        stops: run.map((order, index) => ({
          position: index + 1,
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          status: order.status,
          address: order.deliveryAddress || null,
          eta: order.eta || null,
        })),
      },
    });
  } catch (error) {
    console.error('[RiderRunError]', error?.message || error);
    return res.status(500).json({
      status: 'error',
      message: 'Could not load your deliveries.',
    });
  }
};

export const getRiderOrders = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { status, date, period } = req.query;

    // Build query
    const query = {};
    
    // If riderId field exists in Order model, filter by it
    // Otherwise, get orders with status 'OnWay' or 'Delivered' (rider's orders)
    if (Order.schema.paths.riderId) {
      query.riderId = riderId;
    } else {
      // Fallback: get orders that rider has accepted (status OnWay or Delivered)
      query.status = { $in: ['OnWay', 'Delivered'] };
    }

    // Filter by status if provided
    if (status) {
      if (status === 'active') {
        query.status = 'OnWay';
      } else if (status === 'completed') {
        query.status = 'Delivered';
      } else if (status === 'cancelled' || status === 'Cancelled') {
        query.status = 'RiderRejected';
      } else {
        query.status = status;
      }
    }

    // Date filtering
    if (date) {
      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      // For active orders, filter by assignedAt instead of createdAt
      if (status === 'OnWay') {
        query.assignedAt = { $gte: startOfDay, $lte: endOfDay };
      } else {
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
    } else if (period === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      
      // For active orders, filter by assignedAt instead of createdAt
      if (status === 'OnWay') {
        query.assignedAt = { $gte: start, $lte: end };
      } else {
        query.createdAt = { $gte: start, $lte: end };
      }
    } else if (period === 'yesterday') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      
      // For active orders, filter by assignedAt instead of createdAt
      if (status === 'OnWay') {
        query.assignedAt = { $gte: start, $lte: end };
      } else {
        query.createdAt = { $gte: start, $lte: end };
      }
    } else if (period === 'week') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: start };
    } else if (period === 'month') {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: start };
    }

    const orders = await Order.find(query)
      .populate('restaurantId', 'name address phone')
      .populate('userId', 'name phone email')
      .populate('items.foodItemId', 'name image price')
      .sort({ createdAt: -1 })
      .limit(100);

    // Format orders
    const formattedOrders = orders.map((order) => ({
      id: order._id.toString(),
      orderId: order.orderNumber || deriveOrderNumberFromId(order._id),
      orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
      restaurant: order.restaurantId,
      customer: order.userId,
      items: order.items,
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod || null,
      deliveryFee: order.deliveryFee,
      total: order.total,
      timeline: order.timeline,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    res.status(200).json({
      status: 'success',
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch orders',
    });
  }
};

export const getAllRiderStats = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { date } = req.query;
    
    const selectedDate = date ? new Date(String(date)) : new Date();
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const [active, completed, cancelled, available, todayOrders] = 
      await Promise.all([
        Order.countDocuments({ 
          riderId, status: 'OnWay' 
        }),
        Order.countDocuments({ 
          riderId, status: 'Delivered' 
        }),
        Order.countDocuments({ 
          riderId, status: 'RiderRejected' 
        }),
        Order.countDocuments(buildAvailableOrdersQuery(riderId)),
        Order.find({ 
          riderId, 
          status: 'Delivered',
          createdAt: { $gte: dayStart, $lte: dayEnd }
        }).select('total paymentMethod'),
      ]);

    const todayEarnings = todayOrders.reduce(
      (sum, o) => sum + (o.total || 0), 0
    );
    const todayCashCollected = todayOrders
      .filter((o) => String(o.paymentMethod || '').toLowerCase() === 'cod')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const todayOrderValue = todayOrders
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    return res.status(200).json({
      status: 'success',
      data: {
        active,
        completed,
        cancelled,
        available,
        todayEarnings,
        todayCashCollected,
        todayOrderValue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch stats',
    });
  }
};

/**
 * Get order details for rider
 * GET /api/rider/orders/:orderId
 * Can view available orders (status 'Ready') or assigned orders
 */
export const getRiderOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId = req.riderId;

    const order = await Order.findById(orderId)
      .populate('restaurantId', 'name address phone')
      .populate('userId', 'name phone email')
      .populate('items.foodItemId', 'name image price description');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Allow viewing if:
    // 1. Order is available (status 'Ready' and not assigned to anyone)
    // 2. Order is assigned to this rider
    const isAvailableOrder = order.status === 'Ready' && !order.riderId;
    const isAssignedToRider = order.riderId?.toString() === riderId.toString();
    
    if (!isAvailableOrder && !isAssignedToRider) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. This order is not available or not assigned to you.',
      });
    }

    // Calculate bill summary
    const billSummary = {
      itemsTotal: order.subtotal,
      gstAndPackaging: order.gstAndPackaging || 0,
      platformFee: order.platformFee || 0,
      deliveryFee: order.deliveryFee,
      walletUsed: order.walletUsed || 0,
      total: order.total,
    };

    res.status(200).json({
      status: 'success',
      data: {
        order: {
          id: order._id.toString(),
          orderId: `#${order._id.toString().slice(-6)}`,
          restaurant: order.restaurantId,
          customer: order.userId,
          items: order.items,
          status: order.status,
          deliveryAddress: order.deliveryAddress,
          billSummary,
          timeline: order.timeline,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          notes: order.notes,
          createdAt: order.createdAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch order details',
    });
  }
};

/**
 * Mark order as delivered
 * PATCH /api/rider/orders/:orderId/deliver
 */
export const markAsDelivered = async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId = req.riderId;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Verify rider has access
    if (!order.riderId || order.riderId.toString() !== riderId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. This order is not assigned to you.',
      });
    }

    /**
     * Delivery is proved, not asserted.
     *
     * This endpoint predates handover verification and would close an order on
     * the rider's word alone. The customer's code is what confirms the food
     * reached them, so the rider is sent to /delivery-verify instead.
     */
    if (!order.deliveryVerification?.verifiedAt) {
      return res.status(403).json({
        status: 'error',
        message:
          'Verify the delivery first — ask the customer for their 4-digit code or scan their QR.',
        verifyWith: `/api/rider/orders/${order._id}/delivery-verify`,
      });
    }

    // Check if order is in 'OnWay' status
    if (order.status !== 'OnWay') {
      return res.status(400).json({
        status: 'error',
        message: `Order cannot be marked as delivered. Current status: ${order.status}`,
      });
    }

    // Update status to 'Delivered'
    order.status = 'Delivered';
    order.timeline.push({
      status: 'Delivered',
      timestamp: new Date(),
      message: 'Order delivered successfully',
    });

    await order.save();
    websocketService.emitOrderLifecycle({
      order,
      eventName: 'order_delivered',
      source: 'rider',
      userId: order.userId ? String(order.userId) : null,
      riderId: riderId ? String(riderId) : null,
    });

    // Notify rider — order delivered
    try {
      await notificationService.storeNotification(
        riderId,
        {
          title: 'Order Delivered ?',
          body: `Great job! Order #${order.orderId || order._id.toString().slice(-6)} delivered successfully.`,
          type: 'delivery',
          data: { orderId: order._id.toString(), type: 'order_delivered' },
        },
        'DeliveryBoy'
      );
    } catch (e) {
      console.error('Notification error:', e.message);
    }

    // Process rider earnings
    try {
      const earningsResult = await processRiderEarnings(order._id);
      if (earningsResult.success) {
      } else {
      }
    } catch (earningsError) {
    }

    try {
      await processReferralOnDeliveredOrder(order);
    } catch (referralError) {
    }

    // Update incentive progress on order completion
    try {
      await IncentiveService.updateProgressOnOrder(riderId, order);
    } catch (incentiveError) {
      console.error('Error updating incentive progress:', incentiveError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Order marked as delivered',
      data: {
        order: {
          id: order._id.toString(),
          orderId: `#${order._id.toString().slice(-6)}`,
          status: order.status,
          deliveryFee: order.deliveryFee,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark order as delivered',
    });
  }
};

/**
 * Get rider earnings/stats
 * GET /api/rider/stats
 */
export const getRiderStats = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { date } = req.query;

    // Get rider profile first (needed for onlineHistory and rating)
    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Get all orders assigned to this rider
    const allRiderOrders = await Order.find({
      riderId: riderId,
    });

    // Get delivered orders for earnings calculation
    const deliveredOrders = allRiderOrders.filter(order => order.status === 'Delivered');
    
    // Get all assigned orders (for success rate calculation)
    const assignedOrders = allRiderOrders.filter(order => 
      order.status === 'OnWay' || order.status === 'Delivered'
    );

    // Calculate stats
    const totalEarnings = deliveredOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
    const totalDeliveries = deliveredOrders.length;
    
    // Get today's earnings
    const selectedDate = date ? new Date(String(date)) : new Date();
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const todayOrders = deliveredOrders.filter(
      (order) => {
        const orderDate = new Date(order.updatedAt || order.createdAt);
        return orderDate >= dayStart && orderDate <= dayEnd;
      }
    );
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEarningsAgg = await RiderEarning.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: todayStart },
          status: { $in: ['earned', 'adjusted'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalEarning' },
        },
      },
    ]);
    const todayEarnings = todayEarningsAgg[0]?.total || 0;
    const todayCashCollected = todayOrders
      .filter((order) => String(order.paymentMethod || '').toLowerCase() === 'cod')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const todayOrderValue = todayOrders
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    
    // Calculate online hours (from onlineHistory)
    let onlineHours = 0;
    if (rider?.onlineHistory && rider.onlineHistory.length > 0) {
      const history = rider.onlineHistory.sort((a, b) => a.timestamp - b.timestamp);
      let currentSessionStart = null;
      
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        if (entry.status === true && currentSessionStart === null) {
          // Started being online
          currentSessionStart = new Date(entry.timestamp);
        } else if (entry.status === false && currentSessionStart !== null) {
          // Stopped being online - calculate session duration
          const sessionEnd = new Date(entry.timestamp);
          const duration = (sessionEnd - currentSessionStart) / (1000 * 60 * 60); // Convert to hours
          onlineHours += duration;
          currentSessionStart = null;
        }
      }

      // If currently online, add time from last online status to now
      if (rider.isOnline && currentSessionStart !== null) {
        const now = new Date();
        const duration = (now - currentSessionStart) / (1000 * 60 * 60);
        onlineHours += duration;
      }
    }

    // Round to 1 decimal place
    onlineHours = Math.round(onlineHours * 10) / 10;

    // Get current rating from rider profile (already fetched above)
    const avgRating = rider?.currentRating || 0;
    
    // Calculate success rate: delivered orders / assigned orders
    const successRate = assignedOrders.length > 0 
      ? Math.round((deliveredOrders.length / assignedOrders.length) * 100)
      : 0;

    // Generate chart data (last 7 days, 4 weeks, 4 months)
    const dailyData = [];
    const weeklyData = [];
    const monthlyData = [];

    // Daily data (last 7 days)
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayOrders = deliveredOrders.filter(
        (order) => {
          const orderDate = new Date(order.updatedAt || order.createdAt);
          return orderDate >= date && orderDate < nextDate;
        }
      );
      const dayEarnings = dayOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      dailyData.push({
        value: dayEarnings,
        label: dayLabels[date.getDay()],
      });
    }

    // Weekly data (last 4 weeks)
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekOrders = deliveredOrders.filter(
        (order) => {
          const orderDate = new Date(order.updatedAt || order.createdAt);
          return orderDate >= weekStart && orderDate < weekEnd;
        }
      );
      const weekEarnings = weekOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

      weeklyData.push({
        value: weekEarnings,
        label: `Week ${4 - i}`,
      });
    }

    // Monthly data (last 4 months)
    for (let i = 3; i >= 0; i--) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const monthOrders = deliveredOrders.filter(
        (order) => {
          const orderDate = new Date(order.updatedAt || order.createdAt);
          return orderDate >= monthStart && orderDate < monthEnd;
        }
      );
      const monthEarnings = monthOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthlyData.push({
        value: monthEarnings,
        label: monthLabels[monthStart.getMonth()],
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        todayEarnings,
        todayCashCollected,
        todayOrderValue,
        totalEarnings,
        totalTrips: deliveredOrders.length,
        completedTrips: deliveredOrders.length,
        cancelledTrips: allRiderOrders.filter(order => order.status === 'Cancelled').length,
        avgRating,
        successRate,
        onlineHours,
        perKmCharge: rider?.perKmCharge || 10,
        kycStatus: rider?.kycStatus || 'pending',
        kycDisplayStatus: getKycDisplayStatus(rider?.kycStatus),
        referralEarnings: rider?.referralEarnings || 0,
        totalReferrals: rider?.totalReferrals || 0,
        firstOrderCompleted: deliveredOrders.length > 0,
        dailyChartData: dailyData,
        weeklyChartData: weeklyData,
        monthlyChartData: monthlyData,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch rider stats',
    });
  }
};

/**
 * Toggle rider online/offline status
 * PATCH /api/rider/status
 */
export const toggleRiderStatus = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isOnline must be a boolean value',
      });
    }

    if (!riderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Rider ID is required',
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Allow riders without phone numbers to update status (for existing users)
    // Phone validation should only apply to new rider registrations
    // Update online status
    const previousStatus = rider.isOnline;
    rider.isOnline = isOnline;

    // Add to online history
    if (!rider.onlineHistory) {
      rider.onlineHistory = [];
    }
    rider.onlineHistory.push({
      status: isOnline,
      timestamp: new Date(),
    });

    // Keep only last 100 history entries to prevent unbounded growth
    if (rider.onlineHistory.length > 100) {
      rider.onlineHistory = rider.onlineHistory.slice(-100);
    }

    await rider.save();

    res.status(200).json({
      status: 'success',
      message: `Rider is now ${isOnline ? 'online' : 'offline'}`,
      data: {
        riderId: rider._id.toString(),
        isOnline: rider.isOnline,
        previousStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update rider status',
    });
  }
};

// Upload rider document - POST /api/rider/documents/upload
export const uploadRiderDocument = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { documentType } = req.body;

    // Validate document type
    const allowedDocumentTypes = [
      'drivingLicense',
      'vehicleRC',
      'vehiclePhoto',
      'aadhaar',
      'pan',
      'gst',
      'fssaiLicense',
      'photo',
      'addressProof',
      'passbookCancelledCheque'
    ];

    if (!documentType || !allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: `Document type must be one of: ${allowedDocumentTypes.join(', ')}`,
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

    // Get rider
    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Upload file using cloud storage service
    const cloudStorageService = (await import('../services/cloudStorageService.js')).default;
    const uploadResult = req.file?.location
      ? {
          provider: 's3',
          filename: req.file.key || req.file.originalname,
          storagePath: req.file.key || '',
          publicUrl: req.file.location,
          secureUrl: req.file.location,
        }
      : await cloudStorageService.uploadFile(req.file, 's3', {
          category: 'rider-documents',
          userId: riderId,
        });

    // Create file record
    const FileUpload = (await import('../models/FileUpload.js')).default;
    const fileRecord = new FileUpload({
      originalName: req.file.originalname,
      filename: uploadResult.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      provider: uploadResult.provider,
      storagePath: uploadResult.storagePath,
      publicUrl: uploadResult.publicUrl,
      secureUrl: uploadResult.secureUrl,
      category: 'rider-document',
      documentType,
      uploadedBy: riderId,
      isPublic: false
    });

    await fileRecord.save();

    // Update rider's documents
    if (!rider.kycDocuments) {
      rider.kycDocuments = {};
    }
    rider.kycDocuments[documentType] = uploadResult.publicUrl;

    await rider.save();

    // Format the response to match what getRiderDocuments returns
    const formattedDocument = {
      url: uploadResult.publicUrl,
      uploadedAt: new Date().toISOString(),
      status: 'uploaded'
    };

    res.status(201).json({
      status: 'success',
      message: `${documentType} document uploaded successfully`,
      data: {
        document: {
          id: fileRecord._id,
          type: documentType,
          originalName: req.file.originalname,
          url: uploadResult.publicUrl,
          uploadedAt: fileRecord.createdAt,
        },
        rider: {
          documents: {
            ...rider.kycDocuments,
            [documentType]: formattedDocument
          },
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

// Get rider documents - GET /api/rider/documents
export const getRiderDocuments = async (req, res) => {
  try {
    const riderId = req.riderId;

    const rider = await User.findById(riderId).select('kycDocuments kycStatus');
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Transform kycDocuments to the format expected by mobile app
    const formattedDocuments = {};
    if (rider.kycDocuments) {
      Object.keys(rider.kycDocuments).forEach(key => {
        const docUrl = rider.kycDocuments[key];
        if (docUrl) {
          formattedDocuments[key] = {
            url: docUrl,
            uploadedAt: new Date().toISOString(),
            status: 'uploaded'
          };
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        documents: formattedDocuments,
        kycStatus: rider.kycStatus || 'pending',
        kycDisplayStatus: getKycDisplayStatus(rider.kycStatus),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get documents',
    });
  }
};

// Delete rider document - DELETE /api/rider/documents/:documentType
export const deleteRiderDocument = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { documentType } = req.params;

    // Validate document type
    const allowedDocumentTypes = [
      'drivingLicense',
      'vehicleRC',
      'vehiclePhoto',
      'aadhaar',
      'pan',
      'gst',
      'fssaiLicense',
      'photo',
      'addressProof',
      'passbookCancelledCheque'
    ];

    if (!allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid document type`,
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Delete document from storage if it exists
    if (rider.kycDocuments && rider.kycDocuments[documentType]) {
      const document = rider.kycDocuments[documentType];
      try {
        const cloudStorageService = (await import('../services/cloudStorageService.js')).default;
        await cloudStorageService.deleteFile(document.provider || 'local', document.storagePath);
      } catch (deleteError) {
      }

      // Remove from rider documents
      delete rider.kycDocuments[documentType];
      await rider.save();
    }

    res.status(200).json({
      status: 'success',
      message: `${documentType} document deleted successfully`,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete document',
    });
  }
};

/**
 * Get rider location information
 * GET /api/rider/location
 */
export const getRiderLocation = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login again.',
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    const locationData = {
      address: rider.address || '',
      city: rider.city || '',
      state: rider.state || '',
      pincode: rider.pincode || '',
      coordinates: rider.currentLocation || null,
    };

    res.status(200).json({
      status: 'success',
      data: locationData,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch location',
    });
  }
};

/**
 * Update rider location information
 * PUT /api/rider/location
 */
export const updateRiderLocation = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { address, city, state, pincode, coordinates, latitude, longitude } = req.body;

    /*
     * A position, however it is sent.
     *
     * Only GeoJSON was read, so a caller sending the obvious {latitude,
     * longitude} had it dropped — and was told "Location updated
     * successfully" regardless. Riders stayed at [0,0], which put every one
     * of them thousands of kilometres from the restaurant and made the
     * nearest-rider search meaningless.
     */
    const point = (() => {
      const lat = Number(latitude ?? coordinates?.latitude);
      const lng = Number(longitude ?? coordinates?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { type: 'Point', coordinates: [lng, lat] };
      }
      const pair = coordinates?.coordinates;
      if (Array.isArray(pair) && pair.length === 2 && pair.every((n) => Number.isFinite(Number(n)))) {
        return { type: 'Point', coordinates: [Number(pair[0]), Number(pair[1])] };
      }
      return null;
    })();

    if (coordinates !== undefined || latitude !== undefined || longitude !== undefined) {
      if (!point) {
        return res.status(400).json({
          status: 'error',
          message:
            'Send the position as {latitude, longitude}, or as GeoJSON {type:"Point", coordinates:[lng, lat]}.',
        });
      }
      const [lng, lat] = point.coordinates;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          status: 'error',
          message: 'That is not a point on Earth. Check the order of latitude and longitude.',
        });
      }
    }

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please login again.',
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Update rider location information
    if (address !== undefined) rider.address = address;
    if (city !== undefined) rider.city = city;
    if (state !== undefined) rider.state = state;
    if (pincode !== undefined) rider.pincode = pincode;
    if (point) {
      rider.currentLocation = point;
      rider.lastLocationAt = new Date();
    }

    await rider.save();

    res.status(200).json({
      status: 'success',
      message: 'Location updated successfully',
      data: {
        address: rider.address || '',
        city: rider.city || '',
        state: rider.state || '',
        pincode: rider.pincode || '',
        coordinates: rider.currentLocation || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update location',
    });
  }
};


