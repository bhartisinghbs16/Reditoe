import axios from 'axios';

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = toRad((b.latitude || 0) - (a.latitude || 0));
  const dLng = toRad((b.longitude || 0) - (a.longitude || 0));
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(a.latitude || 0)) * Math.cos(toRad(b.latitude || 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
};

export const computeDynamicEta = async ({
  restaurant,
  userCoordinates,
  maxEtaMinutes = 180,
}) => {
  const prepMinutes = Number(restaurant?.currentPrepTimeMinutes ?? 0);
  const bufferMinutes = Number(restaurant?.deliveryBufferMinutes ?? 15);
  const restCoords = restaurant?.address?.coordinates || {};
  const userCoords = userCoordinates || {};

  let travelMinutes = 0;
  let etaSource = 'fallback';
  if (!global.__etaCache) global.__etaCache = new Map();
  const cacheKey = [
    Number(restCoords.latitude || 0).toFixed(4),
    Number(restCoords.longitude || 0).toFixed(4),
    Number(userCoords.latitude || 0).toFixed(4),
    Number(userCoords.longitude || 0).toFixed(4),
  ].join(':');

  const cached = global.__etaCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < 5 * 60 * 1000)) {
    travelMinutes = cached.travelMinutes;
    etaSource = 'cache';
  } else if (restCoords.latitude && restCoords.longitude && userCoords.latitude && userCoords.longitude) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      try {
        const dm = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
          params: {
            origins: `${restCoords.latitude},${restCoords.longitude}`,
            destinations: `${userCoords.latitude},${userCoords.longitude}`,
            mode: 'driving',
            units: 'metric',
            key,
          },
          timeout: 8000,
        });
        const seconds = dm?.data?.rows?.[0]?.elements?.[0]?.duration?.value;
        if (Number.isFinite(seconds) && seconds > 0) {
          travelMinutes = Math.ceil(seconds / 60);
          etaSource = 'route_api';
        }
      } catch (err) {
        // fallback below
      }
    }
    if (!travelMinutes) {
      const km = haversineKm(restCoords, userCoords);
      // fallback avg urban speed 25km/h
      travelMinutes = Math.max(1, Math.ceil((km / 25) * 60));
      etaSource = 'fallback';
    }
    global.__etaCache.set(cacheKey, { travelMinutes, ts: Date.now() });
  }

  const estimatedDeliveryMinutes = Math.min(
    maxEtaMinutes,
    Math.max(1, Math.round(prepMinutes + travelMinutes + bufferMinutes)),
  );

  return {
    estimatedDeliveryMinutes,
    etaSource,
    etaBreakdown: {
      prepMinutes,
      travelMinutes,
      bufferMinutes,
    },
    deliveryTime: `${estimatedDeliveryMinutes} min`,
  };
};

