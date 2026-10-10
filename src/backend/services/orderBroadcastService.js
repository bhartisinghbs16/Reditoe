import Order from '../models/Order.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import websocketService from './websocketService.js';
import {
  calculateDistance,
  formatAddress,
  formatOrderAssignmentOrderData,
} from './orderAssignmentFormatter.js';

class OrderBroadcastService {
  constructor() {
    this.activeRiders = new Map(); // riderId -> socketId
    this.orderAssignments = new Map(); // orderId -> Set of riderIds who received it
  }

  // Register a rider as online and available for orders
  registerRider(riderId, socketId) {
    this.activeRiders.set(riderId, socketId);
    console.log(`Rider ${riderId} registered for order broadcasts`);
  }

  // Unregister a rider
  unregisterRider(riderId) {
    this.activeRiders.delete(riderId);
    console.log(`Rider ${riderId} unregistered from order broadcasts`);
  }

  // Broadcast new order to all available riders
  async broadcastOrder(order) {
    try {
      // Get all online riders
      const onlineRiders = await this.getOnlineRiders();
      
      if (onlineRiders.length === 0) {
        console.log('No online riders available for order broadcast');
        return;
      }

      // ✅ Populate restaurant data
      const populatedOrder = await Order.findById(order._id).populate('restaurantId');
      const dispatchedAt = new Date();
      const expiresAt = new Date(Date.now() + 300000);

      // Create order assignment data
      const orderAssignment = {
        orderId: order._id.toString(),
        orderData: formatOrderAssignmentOrderData(populatedOrder, {
          restaurant: populatedOrder.restaurantId,
          riderCount: onlineRiders.length,
          dispatchedAt,
          expiresAt,
        }),
        dispatchedAt,
        expiresAt, // 5 minutes for riders to respond
        riderCount: onlineRiders.length
      };

      // Track which riders received this order
      this.orderAssignments.set(order._id.toString(), new Set(onlineRiders.map(r => r._id.toString())));

      // Broadcast to all online riders
      const broadcastPayload = {
        type: 'order:assigned',
        data: orderAssignment
      };

      // Send to each online rider
      onlineRiders.forEach(rider => {
        const socketId = this.activeRiders.get(rider._id.toString());
        if (socketId) {
          websocketService.sendToSocket(socketId, broadcastPayload);
        }
      });

      console.log(`Order ${order._id} broadcasted to ${onlineRiders.length} riders`);

      // Set up order expiration
      this.setupOrderExpiration(order._id.toString(), orderAssignment.expiresAt);

    } catch (error) {
      console.error('Error broadcasting order:', error);
    }
  }

  // Handle rider response to order assignment
  async handleOrderResponse(riderId, orderId, response) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        console.log(`Order ${orderId} not found`);
        return;
      }

      // Check if order is still available
      if (order.riderId || order.dispatchState !== 'pending') {
        console.log(`Order ${orderId} is no longer available`);
        return;
      }

      if (response === 'accept') {
        // Atomic compare-and-set: simultaneous accept taps can assign only one rider.
        const assigned = await Order.findOneAndUpdate(
          { _id: orderId, riderId: { $in: [null, undefined] }, dispatchState: 'pending' },
          { $set: { riderId, dispatchState: 'assigned', acceptedAt: new Date() } },
          { new: true }
        );
        if (!assigned) {
          this.notifyOrderAssigned(orderId, order.riderId || null);
          return { success: false, reason: 'already_assigned' };
        }
        // Remove this offer from every other active rider immediately.
        this.notifyOrderAssigned(orderId, riderId);
        console.log(`Order ${orderId} assigned to rider ${riderId}`);
        return { success: true, riderId: String(riderId) };
      } else {
        // Rider rejected - remove from candidate list
        order.candidateRiderIds = order.candidateRiderIds || [];
        order.candidateRiderIds = order.candidateRiderIds.filter(id => id.toString() !== riderId);
        await order.save();

        // Broadcast rejection to other riders
        this.broadcastOrderResponse(orderId, riderId, 'reject');

        console.log(`Rider ${riderId} rejected order ${orderId}`);
        return { success: true, rejected: true };
      }

    } catch (error) {
      console.error('Error handling order response:', error);
    }
  }

  // Notify all riders that an order was assigned
  notifyOrderAssigned(orderId, assignedRiderId) {
    const payload = {
      type: 'order:assigned_to_rider',
      data: {
        orderId,
        riderId: assignedRiderId
      }
    };

    // Send to all active riders
    this.activeRiders.forEach((socketId, riderId) => {
      websocketService.sendToSocket(socketId, payload);
    });
  }

  // Broadcast order response to other riders
  broadcastOrderResponse(orderId, riderId, response) {
    const payload = {
      type: 'order:response',
      data: {
        orderId,
        riderId,
        response,
        respondedAt: new Date()
      }
    };

    // Send to all active riders except the one who responded
    this.activeRiders.forEach((socketId, activeRiderId) => {
      if (activeRiderId !== riderId) {
        websocketService.sendToSocket(socketId, payload);
      }
    });
  }

  // Set up order expiration
  setupOrderExpiration(orderId, expiresAt) {
    const timeout = setTimeout(async () => {
      try {
        const order = await Order.findById(orderId);
        if (order && order.dispatchState === 'pending') {
          // Mark order as expired
          order.dispatchState = 'expired';
          await order.save();

          // Notify riders that order expired
          this.notifyOrderExpired(orderId);

          console.log(`Order ${orderId} expired due to no response`);
        }
      } catch (error) {
        console.error('Error handling order expiration:', error);
      }
    }, expiresAt.getTime() - Date.now());

    // Store timeout reference for cleanup if needed
    this.orderAssignments.set(orderId, { timeout });
  }

  // Notify riders that order expired
  notifyOrderExpired(orderId) {
    const payload = {
      type: 'order:expired',
      data: { orderId }
    };

    // Send to all riders who received this order
    const assignedRiders = this.orderAssignments.get(orderId);
    if (assignedRiders) {
      assignedRiders.forEach(riderId => {
        const socketId = this.activeRiders.get(riderId);
        if (socketId) {
          websocketService.sendToSocket(socketId, payload);
        }
      });
    }
  }

  // Get all online riders
  async getOnlineRiders() {
    try {
      const onlineRiderIds = Array.from(this.activeRiders.keys());
      const riders = await User.find({
        _id: { $in: onlineRiderIds },
        role: 'rider',
        isOnline: true
      });
      return riders;
    } catch (error) {
      console.error('Error getting online riders:', error);
      return [];
    }
  }

  // Helper method to format address
  formatAddress(address) {
    return formatAddress(address);
  }

  // Helper method to calculate distance (placeholder)
  calculateDistance(order) {
    return calculateDistance(order);
  }

  // Clean up expired assignments
  cleanupExpiredAssignments() {
    const now = new Date();
    
    this.orderAssignments.forEach((assignment, orderId) => {
      if (assignment.expiresAt && assignment.expiresAt < now) {
        this.orderAssignments.delete(orderId);
        
        // Clear timeout if it exists
        if (assignment.timeout) {
          clearTimeout(assignment.timeout);
        }
      }
    });
  }
}

export default new OrderBroadcastService();
