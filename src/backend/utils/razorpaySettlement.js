import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import notificationService from '../services/notificationService.js';
import websocketService from '../services/websocketService.js';

/**
 * Turning a captured Razorpay payment into a placed order.
 *
 * Two things can report the same payment: the customer's app, once checkout
 * closes, and Razorpay's own server, which calls the webhook whether or not
 * the app is still open. A customer who pays and then loses signal or
 * swipes the app away is exactly the case the app can never report, so the
 * webhook has to be able to finish the job alone.
 *
 * Both routes come through here. The order is claimed with one atomic update
 * that only matches while it is still unpaid, so when the app and the
 * webhook arrive together, exactly one of them places the order and the
 * other is told it was already done. Nobody's vendor gets two alerts.
 */
export const settleOrderPayment = async ({ razorpayOrderId, razorpayPaymentId, source }) => {
  const existing = await Order.findOne({ razorpayOrderId });
  if (!existing) return { outcome: 'order_not_found' };

  if (existing.paymentStatus === 'paid') {
    return { outcome: 'already_paid', order: existing };
  }

  /*
   * A payment that arrives for an order that is no longer waiting for one
   * (cancelled or abandoned while the customer was still in checkout). The
   * money has been taken, so it is recorded, but the order is not revived:
   * the timeline says a refund is due, which is the team's call to make.
   */
  const stillWaiting = existing.status === 'Payment Pending';

  const timelineEntry = stillWaiting
    ? {
        status: 'Waiting for Confirmation',
        timestamp: new Date(),
        message: 'Payment verified successfully. Order is waiting for restaurant confirmation.',
      }
    : {
        status: existing.status,
        timestamp: new Date(),
        message: `Payment received after the order was ${String(existing.status).toLowerCase()}. A refund is due.`,
      };

  const update = {
    $set: {
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      razorpayPaymentId,
      ...(stillWaiting ? { status: 'Waiting for Confirmation' } : {}),
    },
    $push: { timeline: timelineEntry },
  };

  const claimed = await Order.findOneAndUpdate(
    { _id: existing._id, paymentStatus: { $ne: 'paid' } },
    update,
    { new: true }
  );

  if (!claimed) {
    // Somebody else got there between the read and the write.
    const settled = await Order.findById(existing._id);
    return { outcome: 'already_paid', order: settled };
  }

  if (!stillWaiting) {
    console.warn(`[Razorpay:${source}] payment landed on a ${existing.status} order ${existing._id}`);
    return { outcome: 'paid_after_cancel', order: claimed };
  }

  try {
    const restaurant = await Restaurant.findById(claimed.restaurantId).select('owner');
    const vendorId = restaurant?.owner ? String(restaurant.owner) : null;

    if (vendorId) {
      try {
        await notificationService.storeNotification(
          vendorId,
          {
            title: 'New Order Received',
            body: `New order ${claimed.orderNumber || claimed._id} received. Please accept to start preparing.`,
            type: 'order',
            data: {
              orderId: claimed._id.toString(),
              orderNumber: claimed.orderNumber || claimed._id.toString(),
              type: 'new_order',
            },
          },
          'vendor'
        );
      } catch (notifyError) {
        console.error('[VendorOrderNotificationError]', notifyError?.message || notifyError);
      }

      websocketService.emitOrderLifecycle({
        order: claimed,
        eventName: 'order_created',
        source: source === 'webhook' ? 'razorpay_webhook' : 'razorpay_payment',
        vendorId,
        userId: claimed.userId ? String(claimed.userId) : null,
      });
    }
  } catch (error) {
    // The order is placed and paid; failing to alert must not undo that.
    console.error('[Razorpay] vendor alert failed:', error?.message || error);
  }

  return { outcome: 'paid', order: claimed };
};

/**
 * The wallet equivalent: credit a captured top-up exactly once.
 *
 * The pending row is flipped to completed with a conditional update first;
 * only the caller that wins that flip credits the balance.
 */
export const settleWalletTopUp = async ({ razorpayOrderId, razorpayPaymentId, userId = null }) => {
  const filter = {
    category: 'wallet_topup',
    'metadata.razorpayOrderId': razorpayOrderId,
    ...(userId ? { userId } : {}),
  };

  const pending = await WalletTransaction.findOne(filter);
  if (!pending) return { outcome: 'topup_not_found' };

  const won = await WalletTransaction.findOneAndUpdate(
    { _id: pending._id, status: { $ne: 'completed' } },
    { $set: { status: 'completed', paymentId: razorpayPaymentId } },
    { new: true }
  );

  if (!won) {
    const wallet = await Wallet.findOne({ userId: pending.userId });
    return { outcome: 'already_added', balance: wallet?.balance ?? 0, added: pending.amount };
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId: pending.userId },
    { $inc: { balance: pending.amount }, $setOnInsert: { userId: pending.userId } },
    { new: true, upsert: true }
  );

  await WalletTransaction.updateOne(
    { _id: pending._id },
    { $set: { balanceBefore: wallet.balance - pending.amount, balanceAfter: wallet.balance } }
  );
  await User.findByIdAndUpdate(pending.userId, { walletBalance: wallet.balance });

  return { outcome: 'added', balance: wallet.balance, added: pending.amount };
};
