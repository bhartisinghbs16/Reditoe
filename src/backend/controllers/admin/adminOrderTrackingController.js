import Order from '../../models/Order.js';
import OrderChat from '../../models/OrderChat.js';
import locationTrackingService from '../../services/locationTrackingService.js';
import { restaurantPoint, hasPoint } from '../../services/serviceabilityService.js';

/**
 * The journey one order took, for the admin.
 *
 * The customer's tracking endpoint refuses anyone who is not the customer,
 * which is right for it and useless here - an admin asking where an order
 * went is exactly who should be told. This answers the same question without
 * that check, and adds nothing the console cannot already see elsewhere.
 *
 * GET /api/admin/orders/:id/tracking
 */
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('riderId', 'name phone vehicleNumber currentLocation')
      .populate('restaurantId', 'name address')
      .lean();

    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    const pickup = restaurantPoint(order.restaurantId);
    const drop = order.deliveryAddress?.coordinates;

    /**
     * Where the rider is now, if they are still carrying it. A delivered
     * order's rider has moved on, and showing where they happen to be
     * standing an hour later would say nothing about this delivery.
     */
    const finished = ['Delivered', 'Cancelled', 'RiderRejected'].includes(order.status);
    const riderPair = order.riderId?.currentLocation?.coordinates;
    const riderAt =
      !finished && Array.isArray(riderPair) && riderPair.length === 2
        ? { latitude: riderPair[1], longitude: riderPair[0] }
        : null;

    // The path already travelled, where any of it was recorded.
    let travelled = [];
    try {
      const live = await locationTrackingService.getOrderTrackingData(
        String(order._id),
        String(order.userId)
      );
      travelled = live?.routeCoordinates ?? [];
    } catch {
      // Nothing was recorded for this order; the two ends still draw a line.
    }

    return res.status(200).json({
      status: 'success',
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        restaurant: {
          name: order.restaurantId?.name ?? 'Restaurant',
          location: hasPoint(pickup) ? pickup : null,
        },
        delivery: {
          address: order.deliveryAddress ?? null,
          location: hasPoint(drop) ? drop : null,
        },
        rider: order.riderId
          ? {
              name: order.riderId.name,
              phone: order.riderId.phone,
              vehicleNumber: order.riderId.vehicleNumber,
              location: riderAt,
            }
          : null,
        routeCoordinates: travelled,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export default { getOrderTracking };


/**
 * GET /admin/orders/:id/chat - what the customer and the partner said.
 *
 * Read-only, and deliberately so: this exists to settle "the rider never
 * called" and "nobody was at the address", and an admin typing into the
 * middle of somebody else's conversation would make the record worth less,
 * not more.
 */
export const getOrderConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id)
      .select('orderNumber status userId riderId')
      .populate('userId', 'name phone')
      .populate('riderId', 'name phone');

    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    const chat = await OrderChat.findOne({ orderId: id });

    return res.status(200).json({
      status: 'success',
      data: {
        orderNumber: order.orderNumber ?? null,
        customer: order.userId
          ? { name: order.userId.name, phone: order.userId.phone }
          : null,
        rider: order.riderId
          ? { name: order.riderId.name, phone: order.riderId.phone }
          : null,
        messages: (chat?.messages ?? []).map((m) => ({
          sender: m.sender,
          message: m.message,
          sentAt: m.sentAt,
          // Whether the other side had seen it, which is the point of the
          // whole record when somebody says they were never told.
          readAt: m.readAt ?? null,
        })),
      },
    });
  } catch (error) {
    console.error('[adminOrderChat] read failed:', error?.message || error);
    return res
      .status(500)
      .json({ status: 'error', message: 'Could not load this conversation.' });
  }
};
