/**
 * Where an order is, in the four stages the customer is shown.
 *
 * The order carries one status, written by whoever moved it last - the vendor,
 * the rider's pickup check, the admin console. The customer's tracking screen
 * used to read that string against a list of its own, so any status the list
 * did not know fell through to the first stop: 'Ready', which is the whole time
 * a rider is on the way to the restaurant, left the screen on its opening
 * state, and the stop that was labelled "Picked Up" was really the kitchen.
 *
 * The mapping is made here, once, from the same status the vendor, rider and
 * admin screens read, so the customer can differ from them in vocabulary only.
 *
 *   preparing   everything before the rider has the food
 *   picked_up   the rider has collected it and is still at the restaurant
 *   on_the_way  the rider has set off
 *   completed   delivered
 *
 * 'cancelled' is the fifth value, for an order that will go no further.
 *
 * The server keeps a single status for the leg after pickup ('OnWay' - the
 * rider's pickup check sets it, and the delivery app treats the order as out
 * for delivery from that moment). Telling "picked up" from "on the way" is
 * therefore a reading of that leg, not a stored fact: the rider counts as set
 * off once they are clear of the restaurant, or - so the screen can never be
 * left on "Picked Up" because a phone sent no position - a couple of minutes
 * after the pickup, whichever comes first.
 */

/** Far enough from the restaurant door that GPS drift cannot account for it. */
const LEFT_RESTAURANT_METRES = 150;

/** How long after pickup a rider is taken to be under way regardless. */
const SET_OFF_AFTER_MS = 2 * 60 * 1000;

const EARTH_RADIUS_METRES = 6_371_000;

const hasPosition = (p) =>
  Boolean(p) &&
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  // The tracking payload reports an unknown restaurant as 0,0.
  !(p.latitude === 0 && p.longitude === 0);

const toRadians = (deg) => (deg * Math.PI) / 180;

function metresBetween(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** When the timeline first (or, with `last`, most recently) recorded `status`. */
function timelineTime(order, status, { last = false } = {}) {
  const hits = (order.timeline || []).filter((entry) => entry.status === status && entry.timestamp);
  const hit = last ? hits[hits.length - 1] : hits[0];
  return hit ? new Date(hit.timestamp) : null;
}

const iso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * @param {object} order           an Order document (or lean object)
 * @param {object} [context]
 * @param {{latitude:number, longitude:number}} [context.riderLocation]
 * @param {{latitude:number, longitude:number}} [context.restaurantLocation]
 * @param {Date} [context.now]
 * @returns {{ stage: string, times: Record<string, string|null> }}
 *   `times` holds when each stage began, or null where nothing recorded it.
 */
export function customerStageFor(order, context = {}) {
  const { riderLocation, restaurantLocation, now = new Date() } = context;

  const pickedAt = order.pickupVerification?.verifiedAt
    ? new Date(order.pickupVerification.verifiedAt)
    : timelineTime(order, 'OnWay', { last: true });

  let stage;
  switch (order.status) {
    case 'Delivered':
      stage = 'completed';
      break;
    case 'Cancelled':
      stage = 'cancelled';
      break;
    case 'OnWay': {
      const clearOfRestaurant =
        hasPosition(riderLocation) &&
        hasPosition(restaurantLocation) &&
        metresBetween(riderLocation, restaurantLocation) > LEFT_RESTAURANT_METRES;
      const longEnough = !pickedAt || now.getTime() - pickedAt.getTime() >= SET_OFF_AFTER_MS;
      stage = clearOfRestaurant || longEnough ? 'on_the_way' : 'picked_up';
      break;
    }
    // Waiting for Confirmation, Order Confirmed, Processing, Ready - and any
    // status this does not know, since an order that has not been collected
    // is, from the customer's side, still with the restaurant.
    default:
      stage = 'preparing';
  }

  const pastPickup = stage === 'picked_up' || stage === 'on_the_way' || stage === 'completed';

  return {
    stage,
    times: {
      preparing: iso(
        timelineTime(order, 'Processing') ??
          timelineTime(order, 'Order Confirmed') ??
          order.createdAt
      ),
      picked_up: pastPickup ? iso(pickedAt) : null,
      // Nothing records the moment a rider rides off, so none is claimed.
      on_the_way: null,
      completed: stage === 'completed' ? iso(timelineTime(order, 'Delivered', { last: true })) : null,
    },
  };
}
