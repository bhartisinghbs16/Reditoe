import Order from '../models/Order.js';

/**
 * The orders a rider is carrying, in the order they will be delivered.
 *
 * A rider can hold several at once. Each one needs to know where it sits in
 * that run, because the customer is shown "you are the next stop" or "one
 * delivery before yours" and both of those are claims that have to be true.
 *
 * The run is derived rather than stored as a list: the orders themselves say
 * who is carrying them and in what position, so there is no separate record
 * to fall out of step when one is cancelled or handed to somebody else.
 */

/** Statuses where the rider still has the food. */
export const CARRYING = ['Ready', 'OnWay'];

/**
 * Every order the rider is currently carrying, first stop first.
 *
 * Orders with no stopIndex sort last rather than being dropped - an order
 * assigned before this existed, or by a route that did not set one, is still
 * a delivery the rider is making.
 */
export const runFor = async (riderId) => {
  if (!riderId) return [];

  const orders = await Order.find({
    riderId,
    status: { $in: CARRYING },
  })
    .select('_id orderNumber status stopIndex deliveryAddress eta assignedAt userId')
    .lean();

  return orders.sort((a, b) => {
    const left = Number.isFinite(a.stopIndex) ? a.stopIndex : Number.MAX_SAFE_INTEGER;
    const right = Number.isFinite(b.stopIndex) ? b.stopIndex : Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    // Same position, or neither has one: oldest assignment goes first.
    return new Date(a.assignedAt || 0) - new Date(b.assignedAt || 0);
  });
};

/**
 * The position to give an order the rider is about to accept.
 *
 * One past whatever they are already carrying, so a newly accepted order is
 * the last stop of the run rather than jumping the queue of customers who
 * were promised a time before it existed.
 */
export const nextStopIndex = async (riderId) => {
  const run = await runFor(riderId);
  const highest = run.reduce(
    (max, order) => (Number.isFinite(order.stopIndex) ? Math.max(max, order.stopIndex) : max),
    0
  );
  return highest + 1;
};

/**
 * How one order sits in its rider's run, for the customer watching it.
 *
 * Returns null when the order has no rider yet, or is the only thing they are
 * carrying - there is no queue to describe, and saying "1 of 1" where nothing
 * was said before is noise.
 */
export const batchViewFor = async (order) => {
  if (!order?.riderId) return null;

  const run = await runFor(order.riderId);
  if (run.length < 2) return null;

  const position = run.findIndex((entry) => String(entry._id) === String(order._id));
  if (position === -1) return null;

  return {
    totalStops: run.length,
    /** 1-based, so it reads the same way the screen says it. */
    yourStop: position + 1,
    stopsBefore: position,
    isNext: position === 0,
    /**
     * Only the customer's own order is named. The other stops are other
     * people's addresses and are nobody else's business - the count is what
     * this customer needs, not who else is being delivered to.
     */
    stops: run.map((entry, index) => ({
      position: index + 1,
      isYours: String(entry._id) === String(order._id),
      status: entry.status,
    })),
  };
};

/**
 * Closes a delivery out of the run and pulls the rest forward.
 *
 * Without the renumbering the second stop stays "stop 2" after the first is
 * delivered, and its customer is told there is still somebody ahead of them.
 */
export const closeStop = async (order) => {
  if (!order?.riderId) return;

  await Order.updateOne({ _id: order._id }, { $set: { stopIndex: null } });

  const remaining = await runFor(order.riderId);
  await Promise.all(
    remaining.map((entry, index) =>
      entry.stopIndex === index + 1
        ? null
        : Order.updateOne({ _id: entry._id }, { $set: { stopIndex: index + 1 } })
    )
  );
};

export default { runFor, nextStopIndex, batchViewFor, closeStop, CARRYING };
