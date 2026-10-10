/**
 * Sending an approved refund back through the gateway that took the money.
 *
 * Only ever called after a person with the refund-approval permission has
 * approved it. Nothing here decides whether a refund is owed - it carries out
 * a decision somebody already made, and records what the gateway said.
 */
import Razorpay from 'razorpay';

let client = null;

/** Built once, and only when there are keys to build it with. */
const gateway = () => {
  if (client) return client;
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  client = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return client;
};

export const isGatewayConfigured = () => Boolean(gateway());

/**
 * Refunds a payment.
 *
 * The amount goes in paise, as Razorpay counts it, and is rounded rather than
 * truncated: a refund of 140.64 must not send back 140.63 and leave a penny
 * of an argument behind.
 *
 * Returns a result rather than throwing, because a gateway that refuses is
 * something the admin has to be shown and the refund has to remember - not an
 * exception that loses which refund it belonged to.
 */
export const refundPayment = async ({ paymentId, amount, notes = {} }) => {
  const razorpay = gateway();
  if (!razorpay) {
    return { ok: false, reason: 'Razorpay is not configured on this server.' };
  }
  if (!paymentId) {
    return {
      ok: false,
      reason: 'This order has no gateway payment recorded, so there is nothing to refund through it.',
    };
  }

  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(Number(amount) * 100),
      speed: 'normal',
      notes,
    });
    /*
     * The bank's own reference for the money moving.
     *
     * Razorpay calls it the ARN (acquirer reference number) on a refund; a
     * bank statement and a customer's passbook call the same thing the RRN.
     * It is what someone chasing "where is my money" can actually quote to
     * their bank, which the gateway's own refund id cannot do. It is not
     * there the instant the refund is created — the acquirer issues it — so
     * it is read when present and left alone when not.
     */
    return {
      ok: true,
      gatewayRefundId: refund.id,
      status: refund.status,
      bankRRN: refund?.acquirer_data?.rrn || refund?.acquirer_data?.arn || '',
      raw: refund,
    };
  } catch (error) {
    // Razorpay puts the useful part in error.error.description.
    const reason =
      error?.error?.description || error?.message || 'The gateway refused the refund.';
    return { ok: false, reason };
  }
};

export default { refundPayment, isGatewayConfigured };
