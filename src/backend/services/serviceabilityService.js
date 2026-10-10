/**
 * Whether a particular restaurant can deliver to a particular address.
 *
 * Each vendor sets the distance they are willing to travel, and that distance
 * is theirs alone: a kitchen happy to ride ten kilometres and one that will
 * not leave its own street are both correct, and a single platform-wide
 * number describes neither. The old listing had no number at all - every
 * approved restaurant was shown to everyone, which is how a customer in one
 * town came to be offered a restaurant in another.
 *
 * The answer is computed here, on the server, and computed again when the
 * order is placed. The app is told the result so it can say something useful,
 * but it is not trusted to decide: a customer can move between opening the
 * menu and paying, and an app can be persuaded to say anything.
 *
 * This is not the radius that decides which riders hear about an order. That
 * one is about staffing a delivery; this one is about whether the delivery
 * may be offered at all. They are set separately and mean different things.
 */

/** Earth's mean radius, kilometres. */
const EARTH_KM = 6371;

/** Platform-wide maximum customer discovery radius. Vendors may choose a
 * smaller radius, but no restaurant is offered beyond this boundary. */
export const PLATFORM_MAX_RADIUS_KM = 10;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Straight-line distance in kilometres.
 *
 * Not road distance. A vendor's radius is a rough statement of range rather
 * than a route, and asking a mapping service for a driving distance to every
 * restaurant on every listing would be a billed request per restaurant per
 * customer, to move a number nobody navigates by.
 */
export const distanceKm = (from, to) => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
};

/**
 * A usable coordinate.
 *
 * 0,0 is a real place in the Atlantic and is what an unset pair looks like in
 * this database, so it is treated as absent rather than as a location every
 * restaurant is implausibly far from.
 */
export const hasPoint = (point) =>
  !!point &&
  Number.isFinite(Number(point.latitude)) &&
  Number.isFinite(Number(point.longitude)) &&
  !(Number(point.latitude) === 0 && Number(point.longitude) === 0);

/** Where a restaurant document says it is. */
export const restaurantPoint = (restaurant) => {
  const c = restaurant?.address?.coordinates;
  return hasPoint(c)
    ? { latitude: Number(c.latitude), longitude: Number(c.longitude) }
    : null;
};

/** The radius this vendor set, or the platform's starting value. */
export const radiusFor = (restaurant, fallbackKm = 5) => {
  const declared = Number(restaurant?.deliveryRadius);
  return Number.isFinite(declared) && declared > 0 ? declared : fallbackKm;
};

/**
 * Reasons a delivery may be unavailable, as codes rather than sentences, so
 * the apps can decide how to say it and this file does not own the wording.
 */
export const REASONS = {
  OK: 'serviceable',
  TOO_FAR: 'outside_radius',
  NO_VENDOR_POINT: 'vendor_location_missing',
  NO_CUSTOMER_POINT: 'customer_location_unknown',
  CITY_CLOSED: 'city_not_serviceable',
};

/**
 * Whether the platform trades in the city this restaurant sits in.
 *
 * A separate question from the vendor's own radius, and it comes first: a
 * city with no riders, no support cover or no licence is closed however
 * willing an individual restaurant is to deliver there.
 *
 * Unknown cities are open. Areas are declared as the business expands, and a
 * platform that refused every city nobody had got round to listing would shut
 * itself down by omission.
 */
export const cityIsOpen = async (restaurant) => {
  const city = restaurant?.address?.city?.trim();
  const state = restaurant?.address?.state?.trim();
  if (!city) return { open: true, declared: false };

  // Imported here rather than at the top so this module stays usable in
  // tests and scripts that have no database connection.
  const { default: ServiceArea } = await import('../models/ServiceArea.js');

  const area = await ServiceArea.findOne({
    city: new RegExp(`^${city}$`, 'i'),
    ...(state ? { state: new RegExp(`^${state}$`, 'i') } : {}),
  }).lean();

  if (!area) return { open: true, declared: false };
  return { open: area.isActive && area.stateActive, declared: true, area };
};

/**
 * Can this restaurant deliver here?
 *
 * Returns the verdict, the two numbers behind it, and a sentence the app can
 * show unchanged. When either end has no coordinates the verdict is that it
 * cannot be established - which is not the same as "yes", and is treated as a
 * refusal everywhere it matters, because a vendor whose location is unknown
 * is exactly the vendor that ends up offered to a different town.
 */
export const checkServiceability = ({ restaurant, customer, fallbackRadiusKm = 5 }) => {
  const radius = radiusFor(restaurant, fallbackRadiusKm);
  const vendorAt = restaurantPoint(restaurant);

  if (!vendorAt) {
    return {
      serviceable: false,
      reason: REASONS.NO_VENDOR_POINT,
      radiusKm: radius,
      distanceKm: null,
      message: 'This restaurant has not set its location yet, so delivery cannot be checked.',
    };
  }

  if (!hasPoint(customer)) {
    return {
      serviceable: false,
      reason: REASONS.NO_CUSTOMER_POINT,
      radiusKm: radius,
      distanceKm: null,
      message: 'Set your delivery location to see whether this restaurant delivers to you.',
    };
  }

  const away = distanceKm(vendorAt, {
    latitude: Number(customer.latitude),
    longitude: Number(customer.longitude),
  });
  const rounded = Number(away.toFixed(2));

  if (away > radius) {
    return {
      serviceable: false,
      reason: REASONS.TOO_FAR,
      radiusKm: radius,
      distanceKm: rounded,
      message:
        `This restaurant delivers within ${radius} km of its location. ` +
        `Your delivery location is ${rounded} km away.`,
    };
  }

  return {
    serviceable: true,
    reason: REASONS.OK,
    radiusKm: radius,
    distanceKm: rounded,
    message: 'Delivery available.',
  };
};

/**
 * The whole question: is the city open, and is the customer inside this
 * vendor's range?
 *
 * Both have to hold. The city being open does not put a customer inside a
 * particular restaurant's radius, and being inside that radius does not help
 * if the business does not trade there. The city is asked first because it is
 * the cheaper refusal to explain.
 */
export const checkFully = async ({ restaurant, customer, fallbackRadiusKm = 5 }) => {
  const city = await cityIsOpen(restaurant);

  if (!city.open) {
    return {
      serviceable: false,
      reason: REASONS.CITY_CLOSED,
      radiusKm: radiusFor(restaurant, fallbackRadiusKm),
      distanceKm: null,
      message: `Reditoe is not delivering in ${restaurant?.address?.city ?? 'this area'} at the moment.`,
    };
  }

  const vendorResult = checkServiceability({ restaurant, customer, fallbackRadiusKm });

  // Reditoe's customer discovery/order boundary is capped at 10 km. A vendor
  // can opt into a smaller radius, never a larger one. This single server-side
  // rule is used by home, search, menu and checkout.
  if (vendorResult.serviceable && vendorResult.distanceKm != null && vendorResult.distanceKm > PLATFORM_MAX_RADIUS_KM) {
    return {
      ...vendorResult,
      serviceable: false,
      reason: REASONS.TOO_FAR,
      radiusKm: PLATFORM_MAX_RADIUS_KM,
      message: `This restaurant is more than ${PLATFORM_MAX_RADIUS_KM} km from your delivery location and is not serviceable.`,
    };
  }

  // Also expose the platform cap when the vendor configured a larger radius,
  // so clients never display a misleading 20/30/50 km service area.
  return {
    ...vendorResult,
    radiusKm: Math.min(vendorResult.radiusKm, PLATFORM_MAX_RADIUS_KM),
  };
};

export default {
  distanceKm,
  hasPoint,
  restaurantPoint,
  radiusFor,
  checkServiceability,
  cityIsOpen,
  checkFully,
  REASONS,
  PLATFORM_MAX_RADIUS_KM,
};
