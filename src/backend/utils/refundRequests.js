import Refund from '../models/Refund.js';

/**
 * One refund request per order.
 *
 * Six places in this codebase created a Refund, and only one of them checked
 * whether the order already had one. A cancelled order that had been paid
 * raised a request, and the gateway refund that followed raised a second for
 * the same money — so Returns & Refunds listed the same request twice and
 * either row could be approved, which is the reported fault and a way to pay
 * a customer twice.
 *
 * A rejected request does not block a new one: a rejection is a decision about
 * that request, and a later problem with the same order deserves to be asked
 * again.
 */

/** The statuses that mean "this order's refund is already being handled". */
const OPEN_STATUSES = ['pending', 'requested', 'under_review', 'approved', 'processed', 'completed'];

/** A readable, unique id for a new request. */
function newRefundId() {
  return `RF-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

/**
 * The order's refund request, raising one only if it has none open.
 *
 * Returns `{ refund, created }` so a caller can tell whether it raised the
 * request or found one — the difference matters for what to tell the customer.
 */
export async function findOrCreateRefundRequest(fields) {
  const orderId = fields?.orderId;
  if (!orderId) throw new Error('A refund request needs an order.');

  const existing = await Refund.findOne({
    orderId,
    refundStatus: { $in: OPEN_STATUSES },
  });
  if (existing) return { refund: existing, created: false };

  const refund = await Refund.create({
    refundId: fields.refundId || newRefundId(),
    refundStatus: 'pending',
    ...fields,
  });
  return { refund, created: true };
}

export { OPEN_STATUSES };
