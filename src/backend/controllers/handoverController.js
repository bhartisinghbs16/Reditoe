/**
 * Handover verification.
 *
 * Two moments in an order change hands, and both used to be taken on trust:
 * the food leaving the vendor's counter, and the food reaching the customer.
 * Each is now proved by a four-digit code the receiving party reads off their
 * own screen and the rider enters or scans.
 *
 * The vendor shows the pickup code; the rider proves it and the order becomes
 * OnWay. The customer shows the delivery code; the rider proves it and the
 * order becomes Delivered. Neither status can be reached any other way, which
 * is the point — the vendor cannot close an order from behind the counter and
 * a rider cannot mark a delivery they did not make.
 */

import mongoose from 'mongoose';
import riderBatchService from '../services/riderBatchService.js';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import websocketService from '../services/websocketService.js';

/** Wrong codes are cheap to guess at four digits, so the attempts are capped. */
const MAX_ATTEMPTS = 5;

const isSameId = (a, b) => a && b && String(a) === String(b);

/**
 * The QR payload.
 *
 * It carries the same code the OTP does, namespaced by order, so a rider can
 * scan or type with the same result and a code photographed from one order is
 * meaningless against another.
 */
const qrPayload = (order, stage, code) =>
  JSON.stringify({ v: 1, stage, orderId: String(order._id), order: order.orderNumber, code });

/**
 * GET /vendor/orders/:orderId/pickup-code
 * The code the vendor shows the rider, plus the QR encoding of it.
 */
export const getVendorPickupCode = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid order ID' });
    }

    const order = await Order.findOne({
      _id: orderId,
      restaurantId: req.restaurantId,
    }).select('+pickupVerification.code');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or does not belong to your restaurant',
      });
    }

    if (order.pickupVerification?.verifiedAt) {
      return res.status(200).json({
        status: 'success',
        data: {
          verified: true,
          verifiedAt: order.pickupVerification.verifiedAt,
          method: order.pickupVerification.method,
        },
      });
    }

    const code = order.pickupVerification?.code;
    if (!code) {
      return res.status(409).json({
        status: 'error',
        message: 'This order predates pickup verification and has no code.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        verified: false,
        orderNumber: order.orderNumber,
        code,
        qr: qrPayload(order, 'pickup', code),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * The code the customer shows the rider on arrival. Served to the customer who
 * owns the order and to nobody else.
 */
export const getCustomerDeliveryCode = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId).select('+deliveryVerification.code');
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    if (!isSameId(order.userId, req.user?._id)) {
      return res.status(403).json({ status: 'error', message: 'This is not your order' });
    }

    /**
     * The code is only shown once the food is actually with the rider.
     *
     * It is minted when the order is created, because that is the only moment
     * the whole order is being written at once - but handing it to the
     * customer straight away invites them to read it out before anyone has
     * collected anything, which is precisely the confirmation it exists to
     * withhold. The pickup being verified is what makes it meaningful, so
     * that is when it appears.
     */
    const pickedUp = Boolean(order.pickupVerification?.verifiedAt);
    const code = pickedUp ? order.deliveryVerification?.code : null;

    res.status(200).json({
      status: 'success',
      data: {
        verified: Boolean(order.deliveryVerification?.verifiedAt),
        orderNumber: order.orderNumber,
        // False until the rider has collected it; the app shows why rather
        // than an empty box where a code should be.
        available: pickedUp,
        reason: pickedUp ? null : 'awaiting_pickup',
        code: code || null,
        qr: code ? qrPayload(order, 'delivery', code) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Reads the code out of whatever the rider submitted — four digits typed, or
 * the JSON payload a scanner returns. Anything else is rejected as unreadable
 * rather than silently treated as a wrong code.
 */
const readSubmittedCode = (body) => {
  const raw = String(body?.code ?? body?.otp ?? body?.qr ?? '').trim();
  if (!raw) return { error: 'Enter the code or scan the QR.' };

  if (/^\d{4}$/.test(raw)) return { code: raw, method: 'otp' };

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.code && /^\d{4}$/.test(String(parsed.code))) {
      return { code: String(parsed.code), method: 'qr', orderId: parsed.orderId };
    }
  } catch {
    /* not JSON — fall through */
  }
  return { error: 'That code could not be read. Enter the 4 digits or rescan.' };
};

/** Shared by both stages: they differ only in which field and which status. */
const verifyStage = async ({ req, res, stage }) => {
  const field = stage === 'pickup' ? 'pickupVerification' : 'deliveryVerification';
  const nextStatus = stage === 'pickup' ? 'OnWay' : 'Delivered';
  const requiredStatus = stage === 'pickup' ? 'Ready' : 'OnWay';

  const { orderId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid order ID' });
  }

  const submitted = readSubmittedCode(req.body);
  if (submitted.error) {
    return res.status(400).json({ status: 'error', message: submitted.error });
  }

  const order = await Order.findById(orderId).select(`+${field}.code`);
  if (!order) {
    return res.status(404).json({ status: 'error', message: 'Order not found' });
  }

  // The rider verifying must be the one carrying it.
  if (!isSameId(order.riderId, req.riderId || req.user?._id)) {
    return res.status(403).json({
      status: 'error',
      message: 'This order is not assigned to you.',
    });
  }

  // A QR scanned off a different order is a different order, not a wrong code.
  if (submitted.orderId && !isSameId(submitted.orderId, order._id)) {
    return res.status(400).json({
      status: 'error',
      message: 'That QR code belongs to a different order.',
    });
  }

  if (order[field]?.verifiedAt) {
    return res.status(200).json({
      status: 'success',
      message: 'Already verified.',
      data: { status: order.status, verifiedAt: order[field].verifiedAt },
    });
  }

  if (order.status !== requiredStatus) {
    return res.status(409).json({
      status: 'error',
      message:
        stage === 'pickup'
          ? `The order is '${order.status}'. It can only be picked up once the vendor marks it Ready.`
          : `The order is '${order.status}'. It can only be delivered once it is out for delivery.`,
    });
  }

  const attempts = Number(order[field]?.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many incorrect attempts. Contact support to complete this order.',
    });
  }

  const expected = order[field]?.code;
  if (!expected) {
    return res.status(409).json({
      status: 'error',
      message: 'This order predates handover verification and has no code.',
    });
  }

  if (submitted.code !== expected) {
    order[field].attempts = attempts + 1;
    await order.save({ validateBeforeSave: false });
    const left = MAX_ATTEMPTS - order[field].attempts;
    return res.status(400).json({
      status: 'error',
      message: `Incorrect code. ${left > 0 ? `${left} attempt${left === 1 ? '' : 's'} left.` : 'No attempts left.'}`,
      attemptsRemaining: Math.max(0, left),
    });
  }

  order[field].verifiedAt = new Date();
  order[field].method = submitted.method;
  if (stage === 'pickup') order[field].verifiedBy = req.riderId || req.user?._id;

  order.status = nextStatus;
  order.timeline.push({
    status: nextStatus,
    timestamp: new Date(),
    message:
      stage === 'pickup'
        ? `Pickup verified by ${submitted.method.toUpperCase()} — order collected`
        : `Delivery verified by ${submitted.method.toUpperCase()} — order delivered`,
  });
  if (stage === 'delivery') order.deliveredAt = new Date();

  await order.save({ validateBeforeSave: false });

  /**
   * A delivered order leaves the run, and the stops behind it move up.
   *
   * Without this the second stop stays numbered two after the first is
   * handed over, and its customer goes on being told somebody is ahead of
   * them while the rider is riding straight to their door.
   */
  if (stage === 'delivery') {
    try {
      await riderBatchService.closeStop(order);
    } catch (err) {
      console.error('[BatchCloseError]', err?.message || err);
    }
  }

  try {
    const restaurant = await Restaurant.findById(order.restaurantId).select('name address');
    websocketService.emitOrderLifecycle({
      order,
      eventName: stage === 'pickup' ? 'order_picked_up' : 'order_delivered',
      source: 'rider',
      userId: order.userId ? String(order.userId) : null,
      riderId: order.riderId ? String(order.riderId) : null,
      restaurant,
    });
  } catch (err) {
    console.error('[HandoverBroadcastError]', err?.message || err);
  }

  res.status(200).json({
    status: 'success',
    message: stage === 'pickup' ? 'Pickup verified' : 'Delivery verified',
    data: { status: order.status, orderNumber: order.orderNumber },
  });
};

export const verifyPickup = (req, res) =>
  verifyStage({ req, res, stage: 'pickup' }).catch((error) =>
    res.status(500).json({ status: 'error', message: error.message })
  );

export const verifyDelivery = (req, res) =>
  verifyStage({ req, res, stage: 'delivery' }).catch((error) =>
    res.status(500).json({ status: 'error', message: error.message })
  );
