import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import notificationService from './notificationService.js';

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = toRad((b.latitude || 0) - (a.latitude || 0));
  const dLng = toRad((b.longitude || 0) - (a.longitude || 0));
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(a.latitude || 0)) * Math.cos(toRad(b.latitude || 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
};

const getRiderCoordinates = (rider) => {
  const c = rider?.currentLocation?.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    return { latitude: Number(c[1]), longitude: Number(c[0]) };
  }
  if (rider?.currentLocation?.latitude && rider?.currentLocation?.longitude) {
    return { latitude: Number(rider.currentLocation.latitude), longitude: Number(rider.currentLocation.longitude) };
  }
  return null;
};

/**
 * A rider's location is only worth measuring against if they actually reported
 * one. [0,0] is the null island in the Gulf of Guinea — it is what an unset
 * GeoJSON point looks like, never where a rider is, and treating it as a real
 * position puts every such rider ~7000km from any Indian restaurant.
 */
const hasUsableLocation = (coords) =>
  Boolean(coords) &&
  Number.isFinite(coords.latitude) &&
  Number.isFinite(coords.longitude) &&
  !(Math.abs(coords.latitude) < 0.0001 && Math.abs(coords.longitude) < 0.0001);

export const triggerAutoDispatchForReadyOrder = async (order, restaurant) => {
  const settings = await Settings.getSettings();
  const radiusKm = Number(settings?.riderDispatch?.riderDispatchRadiusKm || 2);
  /*
   * Long enough to answer. Sixty seconds meant the rider had to unlock the
   * phone, open the app and accept inside a minute of the alert, which is why
   * an offer so often looked like it never arrived. Nothing is lost by
   * waiting: an unanswered offer is re-dispatched to whoever is online.
   */
  const expirySeconds = Number(settings?.riderDispatch?.requestExpirySeconds || 180);
  const vendorCoords = restaurant?.address?.coordinates;

  const riders = await User.find({
    role: 'rider',
    isOnline: true,
    isBlocked: { $ne: true },
    status: 'active',
  }).select('_id name currentLocation');

  /**
   * Who gets offered this order.
   *
   * Distance decides it whenever distance can be known, and the radius widens
   * before it gives up — an order that no one within 2km can take is still
   * better given to someone 8km away than left for nobody.
   *
   * Two cases have no distance to work with: the restaurant has no
   * coordinates on file, or the rider has never reported a position. Both used
   * to remove every candidate and strand the order permanently, which is the
   * reported fault — the vendor marks it Ready and no rider is ever told. An
   * order with no located rider is offered to the online riders instead. A
   * dispatch that reaches someone who then has to be told where to go is a far
   * smaller problem than an order that reaches no one at all.
   */
  const vendorLocated = hasUsableLocation(vendorCoords);
  const measured = vendorLocated
    ? riders
        .map((rider) => {
          const coords = getRiderCoordinates(rider);
          if (!hasUsableLocation(coords)) return null;
          return { rider, distanceKm: haversineKm(vendorCoords, coords) };
        })
        .filter((x) => x && Number.isFinite(x.distanceKm))
        .sort((a, b) => a.distanceKm - b.distanceKm)
    : [];

  // Widen before falling back: the configured radius, then two escalations.
  const ladder = [radiusKm, radiusKm * 3, radiusKm * 10];
  let nearby = [];
  let radiusUsed = radiusKm;
  for (const limit of ladder) {
    nearby = measured.filter((x) => x.distanceKm <= limit);
    radiusUsed = limit;
    if (nearby.length > 0) break;
  }

  // Nobody locatable in range — offer it to whoever is online and working.
  let reachedBy = nearby.length > 0 ? 'radius' : null;
  if (nearby.length === 0 && riders.length > 0) {
    nearby = riders.map((rider) => ({ rider, distanceKm: null }));
    reachedBy = vendorLocated ? 'fallback_all_online' : 'fallback_vendor_unlocated';
  }

  /**
   * Riders who already said no are not asked again.
   *
   * Every sweep rebuilt the candidate list from whoever was nearby, so a
   * rider who declined was put straight back on it and shown the same
   * request seconds later - which is what "the same order keeps appearing"
   * meant.
   */
  const declined = new Set((order.declinedRiderIds || []).map(String));
  if (declined.size) {
    nearby = nearby.filter((x) => !declined.has(String(x.rider._id)));
  }

  const riderIds = nearby.map((x) => x.rider._id);
  const startedAt = new Date();
  const expiresAt = new Date(Date.now() + expirySeconds * 1000);

  const failureReason =
    nearby.length > 0 ? null : riders.length === 0 ? 'no_riders_online' : 'no_nearby_riders';

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        dispatchState: nearby.length > 0 ? 'pending' : 'expired',
        dispatchStartedAt: startedAt,
        dispatchExpiresAt: expiresAt,
        dispatchRadiusKmUsed: radiusUsed,
        candidateRiderIds: riderIds,
        dispatchFailureReason: failureReason,
      },
    }
  );

  for (const item of nearby) {
    try {
      await notificationService.storeNotification(
        item.rider._id.toString(),
        {
          title: 'New Order Request',
          body:
            item.distanceKm === null
              ? 'A new order is ready for pickup. Tap to accept.'
              : `Order request ${item.distanceKm.toFixed(1)} km away. Tap to accept.`,
          type: 'order',
          data: { orderId: order._id.toString(), type: 'nearby_order_request' },
        },
        'DeliveryBoy'
      );
    } catch (err) {
      console.error('[DispatchNotifyError]', err?.message || err);
    }
  }

  return {
    candidates: nearby.length,
    reason: nearby.length > 0 ? reachedBy : failureReason,
    radiusUsed,
  };
};

/**
 * Re-offer orders that are ready but have nobody coming for them.
 *
 * Dispatch used to be one shot: an order that found no rider in the instant it
 * turned Ready was marked expired and never looked at again, so it could sit
 * in the kitchen forever while riders came online around it. This runs before
 * a rider is shown their list, so polling the app is itself what revives a
 * stranded order.
 */
export const redispatchStrandedOrders = async () => {
  const stranded = await Order.find({
    status: 'Ready',
    dispatchState: { $in: ['expired', null] },
    $or: [{ riderId: null }, { riderId: { $exists: false } }],
  })
    .populate('restaurantId', 'name address')
    .sort({ createdAt: 1 })
    .limit(25);

  let revived = 0;
  for (const order of stranded) {
    try {
      const result = await triggerAutoDispatchForReadyOrder(order, order.restaurantId);
      if (result.candidates > 0) revived += 1;
    } catch (err) {
      console.error('[RedispatchError]', err?.message || err);
    }
  }
  return { considered: stranded.length, revived };
};

export const expireStaleDispatches = async () => {
  await Order.updateMany(
    {
      status: 'Ready',
      dispatchState: 'pending',
      dispatchExpiresAt: { $lte: new Date() },
      $or: [{ riderId: null }, { riderId: { $exists: false } }],
    },
    {
      $set: {
        dispatchState: 'expired',
        dispatchFailureReason: 'dispatch_timeout',
      },
    }
  );
};

export const computeOrderDistanceFromRider = (order, rider) => {
  const vendorCoords = order?.restaurantId?.address?.coordinates;
  const riderCoords = getRiderCoordinates(rider);
  if (!vendorCoords?.latitude || !vendorCoords?.longitude || !riderCoords) return null;
  const d = haversineKm(vendorCoords, riderCoords);
  return Number(d.toFixed(1));
};

