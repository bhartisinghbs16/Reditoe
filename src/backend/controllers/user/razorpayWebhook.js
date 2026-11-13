import crypto from 'crypto';
import Order from '../../models/Order.js';
import { settleOrderPayment, settleWalletTopUp } from '../../utils/razorpaySettlement.js';

/**
 * Razorpay's own report of a payment, independent of the customer's phone.
 *
 * The app confirms a payment when checkout closes. If the customer loses
 * signal or closes the app right after paying, that call never happens and
 * the money is taken for an order nobody ever sees. Razorpay calls this
 * endpoint on its own for every captured payment, so the order is placed
 * regardless.
 *
 * Mounted ahead of the JSON parser with a raw body, because the signature is
 * computed over the exact bytes Razorpay sent and re-serialising parsed JSON
 * would not reproduce them. Set the secret as RAZORPAY_WEBHOOK_SECRET (the
 * one typed into Razorpay Dashboard > Webhooks, which is NOT the API secret).
 */
export const verifyRazorpaySignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const SETTLING_EVENTS = new Set(['payment.captured', 'order.paid']);

export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Refuse rather than accept unsigned calls. 503 makes Razorpay retry,
    // so nothing is lost once the secret is configured.
    return res.status(503).json({ success: false, message: 'Webhook is not configured.' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  const signature = req.headers['x-razorpay-signature'];

  if (!verifyRazorpaySignature(rawBody, signature, secret)) {
    return res.status(401).json({ success: false, message: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Bad payload.' });
  }

  if (!SETTLING_EVENTS.has(event?.event)) {
    // Signed but not one we act on (refund.*, payment.failed...): acknowledge.
    return res.json({ success: true, ignored: true });
  }

  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id || event.payload?.order?.entity?.id;
  const razorpayPaymentId = payment?.id;

  if (!razorpayOrderId || !razorpayPaymentId) {
    return res.json({ success: true, ignored: true });
  }

  try {
    const order = await Order.findOne({ razorpayOrderId }).select('total');

    if (order) {
      // The amount charged must be what the order costs; never place an
      // order on a payment for a different figure.
      const expectedPaise = Math.round(Number(order.total) * 100);
      if (payment?.amount != null && Number(payment.amount) !== expectedPaise) {
        console.error(`[Razorpay webhook] amount mismatch for order ${order._id}`);
        return res.json({ success: true, ignored: true, reason: 'amount_mismatch' });
      }
      const result = await settleOrderPayment({
        razorpayOrderId,
        razorpayPaymentId,
        source: 'webhook',
      });
      return res.json({ success: true, outcome: result.outcome });
    }

    const topUp = await settleWalletTopUp({ razorpayOrderId, razorpayPaymentId });
    if (topUp.outcome === 'topup_not_found') {
      // Not ours (or not recorded yet). 200 so Razorpay does not retry forever.
      return res.json({ success: true, ignored: true });
    }
    return res.json({ success: true, outcome: topUp.outcome });
  } catch (error) {
    console.error('[Razorpay webhook] processing failed:', error?.message || error);
    // 500 so Razorpay retries later.
    return res.status(500).json({ success: false });
  }
};
