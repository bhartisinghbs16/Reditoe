import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../../models/Order.js';
import Restaurant from '../../models/Restaurant.js';
import User from '../../models/User.js';
import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import notificationService from '../../services/notificationService.js';
import websocketService from '../../services/websocketService.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Whether real Razorpay credentials have been supplied.
 *
 * The repository ships with obvious placeholders so the platform boots without
 * anybody's live keys in it. Asking Razorpay to open a payment with those gets
 * an authentication failure, which reads to a customer as "something broke".
 * Saying so plainly instead lets the app place the order with its payment
 * still pending, which is what the demo has always done, and lets it start
 * charging the moment the real keys are dropped into the environment.
 */
export const isGatewayConfigured = () => {
  const id = process.env.RAZORPAY_KEY_ID ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  if (!id || !secret) return false;
  if (!/^rzp_(test|live)_/.test(id)) return false;
  return !/placeholder|changeme|your_key/i.test(`${id} ${secret}`);
};

/**
 * Create the payment for an order.
 *
 * The amount comes from the order in the database, never from the request.
 * It used to be taken from the body, so a customer could place a 5,000 rupee
 * order, ask for a payment of one rupee, pay it, and have the order marked
 * paid in full -- the signature that comes back is perfectly valid, because it
 * is a valid signature for the one rupee they were charged.
 *
 * The order also has to belong to whoever is asking. Without that check
 * anybody signed in could start a payment against somebody else's order.
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required',
      });
    }

    if (!isGatewayConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'gateway_not_configured',
        message:
          'Online payment is not switched on yet. Add the Razorpay key id and secret to the server environment to start taking payments.',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'This is not your order' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(409).json({
        success: false,
        message: 'This order has already been paid for.',
      });
    }

    // The figure the platform itself calculated, in paise.
    const payable = Number(order.total);
    if (!Number.isFinite(payable) || payable <= 0) {
      return res.status(409).json({
        success: false,
        message: 'This order has no amount to pay.',
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(payable * 100),
      currency: 'INR',
      receipt: String(orderId),
      notes: {
        orderId: String(orderId),
      },
    });

    /**
     * Remembered so the verification step can check that the signature it is
     * shown belongs to this order, rather than to some other order the same
     * customer paid a rupee for.
     */
    order.razorpayOrderId = razorpayOrder.id;
    await order.save({ validateBeforeSave: false });

    return res.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('Razorpay create order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
    });
  }
};

// Verify Razorpay payment
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id ||
        !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification fields',
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed - invalid signature',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (String(order.userId) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'This is not your order' });
    }

    /**
     * The signature has to belong to *this* order.
     *
     * A valid signature only proves that Razorpay took some payment against
     * some order of theirs. Without tying it back to the one we created here,
     * a customer could pay a rupee for their own order, take that perfectly
     * valid signature, and present it against a different -- far larger --
     * order, which would be marked paid on the strength of it.
     */
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: 'That payment does not belong to this order.',
      });
    }

    // Replaying the same confirmation must not re-run any of what follows --
    // the notifications, the vendor's alert, the timeline entry.
    if (order.paymentStatus === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already recorded for this order.',
        data: { orderId: String(order._id), alreadyPaid: true },
      });
    }

    order.paymentStatus = 'paid';
    order.paymentMethod = 'razorpay';
    order.status = 'Waiting for Confirmation';
    order.razorpayPaymentId = razorpay_payment_id;
    order.timeline.push({
      status: 'Waiting for Confirmation',
      timestamp: new Date(),
      message: 'Payment verified successfully. Order is waiting for restaurant confirmation.',
    });
    await order.save({ validateBeforeSave: false });

    const restaurant = await Restaurant.findById(order.restaurantId).select('owner');
    const vendorId = restaurant?.owner ? String(restaurant.owner) : null;

    if (vendorId) {
      try {
        await notificationService.storeNotification(
          vendorId,
          {
            title: 'New Order Received',
            body: `New order ${order.orderNumber || order._id} received. Please accept to start preparing.`,
            type: 'order',
            data: {
              orderId: order._id.toString(),
              orderNumber: order.orderNumber || order._id.toString(),
              type: 'new_order',
            },
          },
          'vendor'
        );
      } catch (notifyError) {
        console.error('[VendorOrderNotificationError]', notifyError?.message || notifyError);
      }

      websocketService.emitOrderLifecycle({
        order,
        eventName: 'order_created',
        source: 'razorpay_payment',
        vendorId,
        userId: order.userId ? String(order.userId) : null,
      });
    }

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      data: { order },
    });
  } catch (error) {
    console.error('Razorpay verify error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed',
    });
  }
};

/* ── Wallet top-up ──────────────────────────────────────────────────────── */

/**
 * Adding money to the wallet, by paying for it.
 *
 * The wallet already had an `/wallet/add-money` route that simply raised the
 * balance by whatever number it was sent. Nothing in the app called it, which
 * is the only reason it was not a way for any signed-in customer to give
 * themselves unlimited credit. Money now enters the wallet the same way it
 * enters an order: through the gateway, and only on Razorpay's signed word.
 *
 * The platform's other wallet top-up (`/payments/wallet/topup`) is built on
 * Cashfree, which this deployment has no keys for, so it fails on every call.
 * This one uses the gateway that is actually configured.
 */

/** What a customer may put in at once. */
const MIN_TOPUP = 100;
const MAX_TOPUP = 50000;

export const createWalletTopUp = async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount < MIN_TOPUP) {
      return res.status(400).json({
        success: false,
        message: `The smallest top-up is ₹${MIN_TOPUP}.`,
      });
    }
    if (amount > MAX_TOPUP) {
      return res.status(400).json({
        success: false,
        message: `The largest top-up is ₹${MAX_TOPUP.toLocaleString('en-IN')}.`,
      });
    }

    if (!isGatewayConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'gateway_not_configured',
        message:
          'Online payment is not switched on yet. Add the Razorpay key id and secret to the server environment to start taking payments.',
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `topup_${req.user._id}_${Date.now()}`,
      notes: { userId: String(req.user._id), kind: 'wallet_topup' },
    });

    /*
     * A pending row, so the verification step has something of our own to
     * check the signature against. Without it a customer could top up ₹100,
     * then present that same valid signature again claiming ₹50,000 — the
     * signature says only that Razorpay took *a* payment.
     *
     * The balance snapshots are the balance as it stands now; they are
     * rewritten when the payment lands, and are here only because the model
     * requires them.
     */
    const wallet = await Wallet.findOne({ userId: req.user._id });
    const balanceNow = wallet?.balance ?? 0;

    await WalletTransaction.create({
      userId: req.user._id,
      type: 'credit',
      amount,
      description: 'Added to Wallet',
      category: 'wallet_topup',
      status: 'pending',
      balanceBefore: balanceNow,
      balanceAfter: balanceNow,
      metadata: { razorpayOrderId: razorpayOrder.id },
    });

    return res.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('Razorpay wallet top-up error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not start the top-up. Please try again.',
    });
  }
};

export const verifyWalletTopUp = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification fields',
      });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed - invalid signature',
      });
    }

    // The top-up this signature belongs to, and it has to be this customer's.
    const pending = await WalletTransaction.findOne({
      userId: req.user._id,
      category: 'wallet_topup',
      'metadata.razorpayOrderId': razorpay_order_id,
    });

    if (!pending) {
      return res.status(400).json({
        success: false,
        message: 'That payment does not belong to a top-up on this account.',
      });
    }

    // Replaying the same confirmation must not credit the wallet twice.
    if (pending.status === 'completed') {
      const settled = await Wallet.findOne({ userId: req.user._id });
      return res.json({
        success: true,
        message: 'This top-up has already been added.',
        data: { balance: settled?.balance ?? 0, alreadyAdded: true },
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user._id },
      { $setOnInsert: { userId: req.user._id, balance: 0 } },
      { new: true, upsert: true }
    );

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + pending.amount;

    pending.status = 'completed';
    pending.paymentId = razorpay_payment_id;
    pending.balanceBefore = balanceBefore;
    pending.balanceAfter = balanceAfter;
    await pending.save();

    wallet.balance = balanceAfter;
    await wallet.save();
    await User.findByIdAndUpdate(req.user._id, { walletBalance: balanceAfter });

    return res.json({
      success: true,
      message: 'Wallet topped up.',
      data: { balance: balanceAfter, added: pending.amount },
    });
  } catch (error) {
    console.error('Razorpay wallet verify error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not confirm the top-up. Please contact support.',
    });
  }
};
