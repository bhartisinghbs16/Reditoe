/**
 * Admin order controller. Read-only access to all orders + status updates + rider assignment.
 * Does NOT modify existing orderController or orderRoutes.
 */
import Order, { deriveOrderNumberFromId } from '../../models/Order.js';
import Refund from '../../models/Refund.js';
import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import { refundPayment } from '../../services/refundGatewayService.js';
import User from '../../models/User.js';
import DeliveryBoy from '../../models/DeliveryBoy.js';
import Dispute from '../../models/Dispute.js';
import mongoose from 'mongoose';
import websocketService from '../../services/websocketService.js';
import { closeOrderCommunicationIfNeeded } from '../../services/orderCommunicationLifecycleService.js';
import notificationService from '../../services/notificationService.js';
import orderBroadcastService from '../../services/orderBroadcastService.js';

const VALID_STATUSES = [
  'Waiting for Confirmation',
  'Order Confirmed',
  'In Progress',
  'Processing',
  'Ready',
  'OnWay',
  'Delivered',
  'Cancelled',
  'RiderRejected',
  'Pending',
  'Payment Pending',
];

/** Ensure orderNumber on each order for API response. Never overwrite stored orderNumber. */
function ensureOrderNumbers(orders) {
  return orders.map((o) => {
    const hasStored = o.orderNumber && String(o.orderNumber).trim().length > 0;
    if (!hasStored && o._id) {
      o.orderNumber = deriveOrderNumberFromId(o._id);
    }
    return o;
  });
}

/** Allowed status transitions (current -> [allowed next]). Cancelled is terminal. */
const ALLOWED_TRANSITIONS = {
  'Pending': ['Waiting for Confirmation', 'Cancelled'],
  'Waiting for Confirmation': ['Order Confirmed', 'Cancelled'],
  'Order Confirmed': ['Processing', 'Cancelled'],
  'Processing': ['Ready', 'Cancelled'],
  'Ready': ['OnWay', 'Cancelled'],
  'OnWay': ['Delivered', 'Cancelled'],
  'Delivered': [],
  'Cancelled': [],
};

/**
 * GET /admin/orders - List all orders (paginated, filterable)
 * Query: page, limit, status, restaurantId, riderId, fromDate, toDate
 */
export const getOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const restaurantId = req.query.restaurantId;
    const riderId = req.query.riderId;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const city = (req.query.city || '').trim();
    const state = (req.query.state || '').trim();

    const filter = { status: { $ne: 'Payment Pending' } };

    /**
     * Where the order was delivered, not where the restaurant is: an owner
     * asking for orders in a city means the customers there.
     *
     * Anchored and case-insensitive, so "Tirupati" does not also bring back
     * "Tirupati Rural" when the filter offers the two separately.
     */
    const exactly = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (city) filter['deliveryAddress.city'] = exactly(city);
    if (state) filter['deliveryAddress.state'] = exactly(state);
    if (status && VALID_STATUSES.includes(status)) {
      filter.status = status;
    }
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }
    if (riderId && typeof riderId === 'string' && mongoose.Types.ObjectId.isValid(riderId)) {
      filter.riderId = new mongoose.Types.ObjectId(riderId);
    }
    if (fromDate || toDate) {
      const dateFilter = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime())) dateFilter.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (!isNaN(to.getTime())) dateFilter.$lte = to;
      }
      if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;
    }

    const [ordersRaw, total] = await Promise.all([
      Order.find(filter)
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name image rating deliveryTime deliveryFee')
        .populate('riderId', 'name email phone')
        .populate('items.foodItemId', 'name image price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    const orders = ensureOrderNumbers(ordersRaw);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        orders,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch orders',
    });
  }
};

/**
 * PATCH /admin/orders/:id/status - Update order status (admin only)
 * Allowed transitions only. Does not change Order schema; only status + timeline.
 * Set bypassTransitionCheck=true to skip transition validation (for testing only).
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, bypassTransitionCheck = false } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    const current = order.status;
    const allowed = ALLOWED_TRANSITIONS[current];
    if (!bypassTransitionCheck && allowed && !allowed.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot change status from "${current}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
      });
    }

    order.status = status;
    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status,
      timestamp: new Date(),
      message: `Status updated to ${status}`,
    });
    await order.save();
    await closeOrderCommunicationIfNeeded(order._id);

    // Emit real-time update via WebSocket
    websocketService.emitOrderUpdate(order, 'status_change');

    try {
      const typeMapping = {
        'Waiting for Confirmation': 'order_placed',
        'Order Confirmed': 'order_accepted',
        'In Progress': 'order_accepted',
        'Processing': 'order_accepted',
        'Ready': 'order_accepted',
        'OnWay': 'order_on_the_way',
        'Delivered': 'order_delivered',
        'Cancelled': 'order_cancelled'
      };
      const notifType = typeMapping[status];
      if (notifType) {
        await notificationService.sendOrderNotification(order._id, notifType);
      }
    } catch (notifErr) {
      console.error('[AdminOrderController] Non-fatal error sending notification:', notifErr.message);
    }

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');
    await order.populate('riderId', 'name email phone');

    res.status(200).json({
      status: 'success',
      message: 'Order status updated',
      data: {
        order,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update order status',
    });
  }
};

/**
 * GET /admin/orders/:id - Get single order by ID
 */
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    const order = await Order.findById(id)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name image rating deliveryTime deliveryFee address phone')
      .populate('riderId', 'name email phone riderId vehicleName vehicleNumber')
      .populate('items.foodItemId', 'name image price');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    const orderObj = order.toObject ? order.toObject() : order;
    if (!orderObj.orderNumber && orderObj._id) {
      orderObj.orderNumber = deriveOrderNumberFromId(orderObj._id);
    }

    res.status(200).json({
      status: 'success',
      data: {
        order: orderObj,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch order',
    });
  }
};

const TERMINAL_STATUSES = ['Delivered', 'Cancelled'];

/**
 * PATCH /admin/orders/:id/assign-rider - Enhanced rider assignment with tracking
 * Body: { riderId, notes? }
 */
export const assignRiderToOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { riderId, notes } = req.body;
    const adminId = req.user?.id || req.user?._id || null;

    console.log('[RIDER_ASSIGN][BACKEND] incoming_order_id', id);
    console.log('[RIDER_ASSIGN][BACKEND] incoming_rider_id', riderId);
    console.log('[RIDER_ASSIGN][BACKEND] authenticated_admin_id', adminId);
    console.log('[RIDER_ASSIGN][BACKEND] incoming_payload', { riderId, notes });

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'order_id_is_valid_object_id',
        value: id,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    console.log('[RIDER_ASSIGN][BACKEND] validation_check_passed', {
      check: 'order_id_is_valid_object_id',
      value: id,
    });

    if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'rider_id_is_valid_object_id',
        value: riderId,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Valid riderId is required',
      });
    }

    console.log('[RIDER_ASSIGN][BACKEND] validation_check_passed', {
      check: 'rider_id_is_valid_object_id',
      value: riderId,
    });

    const order = await Order.findById(id);
    console.log('[RIDER_ASSIGN][BACKEND] fetched_order_result', {
      found: Boolean(order),
      id: order?._id?.toString?.() || null,
      status: order?.status || null,
      currentRiderId: order?.riderId?.toString?.() || null,
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    if (TERMINAL_STATUSES.includes(order.status)) {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'order_not_terminal',
        orderStatus: order.status,
      });
      return res.status(400).json({
        status: 'error',
        message: `Cannot assign rider: order is already ${order.status}`,
      });
    }

    console.log('[RIDER_ASSIGN][BACKEND] validation_check_passed', {
      check: 'order_not_terminal',
      orderStatus: order.status,
    });

    // Look up rider in User collection first, then DeliveryBoy
    let rider = await User.findOne({ _id: riderId, role: 'rider' });
    let riderSource = 'user';
    console.log('[RIDER_ASSIGN][BACKEND] fetched_rider_result_user', {
      found: Boolean(rider),
      id: rider?._id?.toString?.() || null,
      role: rider?.role || null,
      isBlocked: rider?.isBlocked ?? null,
      kycStatus: rider?.kycStatus || null,
    });

    // If not found in User collection, check DeliveryBoy collection
    if (!rider) {
      const deliveryBoyRecord = await DeliveryBoy.findById(riderId);
      console.log('[RIDER_ASSIGN][BACKEND] fetched_rider_result_deliveryBoy', {
        found: Boolean(deliveryBoyRecord),
        id: deliveryBoyRecord?._id?.toString?.() || null,
        status: deliveryBoyRecord?.status || null,
        isBlocked: deliveryBoyRecord?.isBlocked ?? null,
        kycStatus: deliveryBoyRecord?.kycStatus || null,
      });
      if (deliveryBoyRecord) {
        rider = deliveryBoyRecord;
        riderSource = 'deliveryBoy';
      }
    }

    if (!rider) {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'rider_not_found_in_any_collection',
        riderId,
      });
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Validate rider is assignable: KYC not rejected, not blocked, status active
    const riderKycStatus = rider.kycStatus || 'pending';
    const riderIsBlocked = rider.isBlocked ?? false;
    const riderStatus = rider.status || 'pending';

    console.log('[RIDER_ASSIGN][BACKEND] rider_assignability_check', {
      kycStatus: riderKycStatus,
      isBlocked: riderIsBlocked,
      status: riderStatus,
    });

    // KYC check — warn but don't block admin assignment
    if (riderKycStatus === 'rejected') {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'rider_kyc_rejected',
        riderId,
        kycStatus: riderKycStatus,
      });
      return res.status(400).json({
        success: false,
        message: 'Rider KYC is rejected. Cannot assign rejected rider.',
      });
    }

    if (riderIsBlocked) {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'rider_is_blocked',
        riderId,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Rider is blocked',
      });
    }

    if (riderStatus !== 'active') {
      console.log('[RIDER_ASSIGN][BACKEND] validation_check_failed', {
        check: 'rider_status_not_active',
        riderId,
        status: riderStatus,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Rider is not active',
      });
    }

    console.log('[RIDER_ASSIGN][BACKEND] validation_check_passed', {
      check: 'rider_assignable',
      riderId,
      source: riderSource,
    });

    // Track assignment history
    const previousRiderId = order.riderId;
    order.riderId = new mongoose.Types.ObjectId(riderId);
    
    // Initialize assignment history if not exists
    if (!order.assignmentHistory) order.assignmentHistory = [];
    
    // Add to assignment history
    order.assignmentHistory.push({
      riderId: new mongoose.Types.ObjectId(riderId),
      assignedBy: req.user.id, // Admin who assigned
      assignedAt: new Date(),
      assignmentType: 'manual',
      notes: notes || (previousRiderId ? 'Reassigned by admin' : 'Manually assigned by admin'),
    });

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      message: `Rider ${rider.name} assigned by admin${notes ? `: ${notes}` : ''}`,
    });

    if (order.status === 'Ready' ||
        order.status === 'RiderRejected') {
      order.status = 'OnWay';
      // Reset dispatch state to prevent race conditions with auto-dispatch
      order.dispatchState = 'assigned';
      order.candidateRiderIds = [];
      order.dispatchFailureReason = null;
      order.assignedAt = new Date();
      order.timeline.push({
        status: 'OnWay',
        timestamp: new Date(),
        message: 'Status updated to OnWay (rider assigned)',
      });
    }

    console.log('[RIDER_ASSIGN][BACKEND] pre_save_assignment_state', {
      orderId: order._id?.toString?.() || null,
      previousRiderId: previousRiderId?.toString?.() || null,
      nextRiderId: order.riderId?.toString?.() || null,
      statusBeforeSave: order.status,
      assignmentHistoryCount: Array.isArray(order.assignmentHistory) ? order.assignmentHistory.length : 0,
      timelineCount: Array.isArray(order.timeline) ? order.timeline.length : 0,
    });

    const savedOrder = await order.save();
    console.log('[RIDER_ASSIGN][BACKEND] db_update_result', {
      acknowledged: true,
      savedOrderId: savedOrder?._id?.toString?.() || null,
      updatedAt: savedOrder?.updatedAt || null,
    });

    console.log('[RIDER_ASSIGN][BACKEND] final_saved_state', {
      orderId: savedOrder?._id?.toString?.() || null,
      riderId: savedOrder?.riderId?.toString?.() || null,
      status: savedOrder?.status || null,
      timelineLastEntry: Array.isArray(savedOrder?.timeline) && savedOrder.timeline.length > 0
        ? savedOrder.timeline[savedOrder.timeline.length - 1]
        : null,
    });

    // Emit real-time rider assignment via WebSocket
    websocketService.emitRiderAssignment(order, riderId, previousRiderId);
    
    // Notify all candidate riders that this order was taken by admin
    // This prevents race conditions where riders still see the order as available
    try {
      orderBroadcastService.notifyOrderAssigned(order._id.toString(), riderId);
    } catch (broadcastErr) {
      console.log('Broadcast error (non-critical):', broadcastErr.message);
    }

    // Notify rider — new order assigned
    try {
      // Find User._id for this rider (may be DeliveryBoy._id or User._id)
      let riderUserId = riderId;
      try {
        // Check if riderId belongs to User model directly
        const riderUser = await User.findOne({
          _id: riderId,
          role: 'rider',
        });
        if (riderUser) {
          riderUserId = riderUser._id.toString();
        } else {
          // Try finding User by matching DeliveryBoy record
          const deliveryBoy = await DeliveryBoy.findById(riderId);
          if (deliveryBoy) {
            // Find matching User by phone or email
            const matchedUser = await User.findOne({
              role: 'rider',
              $or: [
                { phone: deliveryBoy.phone },
                { email: deliveryBoy.email },
              ],
            });
            if (matchedUser) {
              riderUserId = matchedUser._id.toString();
            }
          }
        }
      } catch (e) {
        console.error('Error finding rider User ID:', e.message);
        riderUserId = riderId; // fallback to original
      }

      console.log('[assignRider] Storing notification for riderUserId:', riderUserId);
      await notificationService.storeNotification(
        riderUserId,
        {
          title: 'New Order Assigned',
          body: `A new order ${order.orderNumber || deriveOrderNumberFromId(order._id)} has been assigned to you. Tap to view details.`,
          type: 'order',
          data: { 
            orderId: order._id.toString(), 
            type: 'order_assigned' 
          },
        },
        'DeliveryBoy'
      );
      console.log('[assignRider] Notification stored successfully');
    } catch (e) {
      console.error('[assignRider] Notification error:', e.message);
    }

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');

    // Convert to plain object and manually attach rider data
    // (works for both User and DeliveryBoy collection riders;
    //  Mongoose populate('riderId') only resolves User refs)
    const orderResponse = order.toObject();
    orderResponse.riderId = {
      _id: rider._id,
      name: rider.name || '',
      email: rider.email || '',
      phone: rider.phone || '',
      riderId: rider.riderId || null,
      vehicleName: rider.vehicleName || null,
      vehicleNumber: rider.vehicleNumber || null,
    };

    console.log('[RIDER_ASSIGN][BACKEND] response_rider_data', {
      source: riderSource,
      riderId: rider._id?.toString?.() || null,
      name: rider.name || '',
    });

    res.status(200).json({
      status: 'success',
      message: 'Rider assigned successfully',
      data: {
        order: orderResponse,
      },
    });
  } catch (error) {
    console.log('[RIDER_ASSIGN][BACKEND] unhandled_error', {
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to assign rider',
    });
  }
};

// Active order statuses for live monitoring
const ACTIVE_STATUSES = [
  'Waiting for Confirmation',
  'Order Confirmed', 
  'Processing',
  'Ready',
  'OnWay',
];

/**
 * GET /admin/orders/live - Get live/active orders for monitoring
 * Query: page, limit, status, restaurantId, riderId
 */
export const getLiveOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const restaurantId = req.query.restaurantId;
    const riderId = req.query.riderId;

    // Build filter for active orders only
    let filter = { status: { $in: ACTIVE_STATUSES } };
    
    // Add status filter if provided and valid
    if (status && typeof status === 'string' && ACTIVE_STATUSES.includes(status)) {
      filter.status = status;
    }
    
    // Add restaurant filter if provided and valid ObjectId
    if (restaurantId && typeof restaurantId === 'string' && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }
    
    // Add rider filter if provided and valid ObjectId
    if (riderId && typeof riderId === 'string' && mongoose.Types.ObjectId.isValid(riderId)) {
      filter.riderId = new mongoose.Types.ObjectId(riderId);
    }

    const [ordersRaw, total] = await Promise.all([
      Order.find(filter)
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name image rating deliveryTime')
        .populate('riderId', 'name email phone riderId vehicleName vehicleNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    const orders = ensureOrderNumbers(ordersRaw);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        orders,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch live orders',
    });
  }
};

/**
 * PATCH /admin/orders/:id/cancel - Admin cancel order
 * Body: { reason, notes }
 */
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Cancellation reason is required',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    if (order.status === 'Cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Order is already cancelled',
      });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel delivered order',
      });
    }

    // Update order status and cancellation info
    order.status = 'Cancelled';
    order.cancelledBy = req.user.id;
    order.cancellationReason = reason.trim();
    order.cancellationNotes = notes ? notes.trim() : '';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'Cancelled',
      timestamp: new Date(),
      message: `Order cancelled by admin: ${reason.trim()}`,
    });

    await order.save();
    await closeOrderCommunicationIfNeeded(order._id);

    // Emit real-time cancellation via WebSocket
    websocketService.emitOrderCancellation(order, reason.trim());

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');
    await order.populate('riderId', 'name email phone riderId vehicleName vehicleNumber');

    res.status(200).json({
      status: 'success',
      message: 'Order cancelled successfully',
      data: {
        order,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to cancel order',
    });
  }
};

/**
 * PATCH /admin/orders/:id/refund - Mark order as refunded (tracking only)
 * Body: { refundAmount, reason, notes } — `amount` is accepted for refundAmount
 */
export const markRefund = async (req, res) => {
  let gatewayRefundId = null;
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;
    // The console names this plainly `amount`. Both spellings are read so a
    // refund isn't silently rejected as "must be greater than 0" when a figure
    // was in fact supplied.
    const refundAmount = req.body.refundAmount ?? req.body.amount;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund amount must be greater than 0',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund reason is required',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    if (order.refundInfo?.isRefunded) {
      return res.status(400).json({
        status: 'error',
        message: 'Order is already marked as refunded',
      });
    }

    /*
     * A refund taken from the order screen is still a refund.
     *
     * This wrote refundInfo onto the order and marked it refunded, and that
     * was all: no Refund record, so it never appeared under Returns &
     * Refunds, and no money left the gateway, so the customer was told they
     * had been refunded and had not been. The order screen and the refunds
     * queue were describing different things.
     *
     * It now goes through the same path as an approved request - one record,
     * one payment - so both routes agree.
     */
    const amount = parseFloat(refundAmount);
    const settleTo = order.paymentMethod === 'wallet' ? 'wallet' : 'original_payment';

    if (settleTo === 'original_payment') {
      const paid = await refundPayment({
        paymentId: order.razorpayPaymentId,
        amount,
        notes: {
          orderNumber: order.orderNumber || '',
          reason: reason.trim(),
          refundedBy: req.user?.name || req.user?.email || 'admin',
        },
      });
      if (!paid.ok) {
        return res.status(502).json({
          status: 'error',
          code: 'gateway_refund_failed',
          message: `The refund was not paid out: ${paid.reason}`,
        });
      }
      gatewayRefundId = paid.gatewayRefundId;
    } else {
      const wallet =
        (await Wallet.findOne({ userId: order.userId })) ||
        new Wallet({ userId: order.userId, balance: 0 });
      const before = Number(wallet.balance || 0);
      const after = Math.round((before + amount) * 100) / 100;
      wallet.balance = after;
      wallet.lastTransactionAt = new Date();
      await wallet.save();

      await WalletTransaction.create({
        userId: order.userId,
        type: 'credit',
        amount,
        description: `Refund for order ${order.orderNumber || ''}`.trim(),
        status: 'completed',
        category: 'refund',
        balanceBefore: before,
        balanceAfter: after,
        metadata: { refundedBy: String(req.user?.id || 'admin'), source: 'refund' },
      });

      await User.updateOne({ _id: order.userId }, { $set: { walletBalance: after } });
    }

    /*
     * The record the Returns & Refunds screen reads. Written as already
     * approved and processed, because the money has just moved - marking it
     * pending would put a settled refund back in the approval queue.
     */
    const existingRefund = await Refund.findOne({ orderId: order._id });
    if (!existingRefund) {
      await Refund.create({
        orderId: order._id,
        userId: order.userId,
        refundAmount: amount,
        refundReason: reason.trim(),
        refundStatus: 'approved',
        refundMethod: settleTo,
        adminActionLog: [
          {
            adminId: req.user.id,
            action: 'processed',
            notes: notes ? notes.trim() : '',
            timestamp: new Date(),
          },
        ],
        processingDetails: {
          transactionId: gatewayRefundId || `wallet:${order._id}`,
          processedAt: new Date(),
          processor: req.user?.name || req.user?.email || 'admin',
        },
        refundTimeline: [
          {
            status: 'processed',
            timestamp: new Date(),
            message: `Refunded from the order screen: ₹${amount} - ${reason.trim()}`,
            updatedBy: req.user.id,
          },
        ],
      });
    }

    // Update refund info
    order.refundInfo = {
      isRefunded: true,
      refundAmount: amount,
      refundReason: reason.trim(),
      refundNotes: notes ? notes.trim() : '',
      refundDate: new Date(),
      refundedBy: req.user.id,
    };

    // Update payment status to refunded
    order.paymentStatus = 'refunded';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      message: `Refund marked: ₹${refundAmount} - ${reason.trim()}`,
    });

    await order.save();

    // Emit real-time refund update via WebSocket
    websocketService.emitRefundUpdate(order, {
      refundAmount: parseFloat(refundAmount),
      refundReason: reason.trim(),
      refundNotes: notes ? notes.trim() : '',
      refundedBy: req.user.id,
      refundDate: new Date()
    });

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');
    await order.populate('riderId', 'name email phone riderId vehicleName vehicleNumber');

    res.status(200).json({
      status: 'success',
      message: 'Refund marked successfully',
      data: {
        order,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark refund',
    });
  }
};

/**
 * PATCH /admin/orders/:id/dispute - Open or resolve dispute
 * Body: { disputeStatus, disputeNotes }
 */
export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { disputeStatus, disputeNotes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    if (!disputeStatus || !['open', 'resolved'].includes(disputeStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Dispute status must be either "open" or "resolved"',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Update dispute status and notes
    order.disputeStatus = disputeStatus;
    order.disputeNotes = disputeNotes ? disputeNotes.trim() : '';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      message: `Dispute ${disputeStatus} by admin${disputeNotes ? `: ${disputeNotes.trim()}` : ''}`,
    });

    await order.save();

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');
    await order.populate('riderId', 'name email phone riderId vehicleName vehicleNumber');

    res.status(200).json({
      status: 'success',
      message: `Dispute ${disputeStatus} successfully`,
      data: {
        order,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update dispute',
    });
  }
};

/**
 * PATCH /admin/orders/:id/admin-notes - Update admin notes
 * Body: { adminNotes }
 */
export const updateAdminNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    order.adminNotes = adminNotes ? adminNotes.trim() : '';
    await order.save();

    await order.populate('userId', 'name email phone');
    await order.populate('restaurantId', 'name image');
    await order.populate('riderId', 'name email phone riderId vehicleName vehicleNumber');

    res.status(200).json({
      status: 'success',
      message: 'Admin notes updated successfully',
      data: {
        order,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update admin notes',
    });
  }
};
