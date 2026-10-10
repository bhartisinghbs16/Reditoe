/**
 * Turning a typed address into a point on the map.
 *
 * Delivery is charged on the distance between the restaurant and the
 * customer, and the customer's end of that line is only known if their
 * address carries coordinates. The app captures them when somebody taps "use
 * my current location", but an address typed by hand had none - so the
 * distance came out as zero and every such order was charged the base fare
 * however far it actually went.
 *
 * Doing it here rather than in the app covers every way an address can be
 * created, including ones staff enter on a customer's behalf.
 */
import axios from 'axios';

/**
 * Looks up one address. Returns null rather than throwing: an address that
 * cannot be located is still an address, and refusing to save it would be a
 * worse failure than pricing that one delivery from the base fare.
 */
export const geocodeAddress = async (parts) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const query = [parts.street, parts.city, parts.state, parts.zipCode, parts.country || 'India']
    .filter(Boolean)
    .join(', ')
    .trim();
  if (!query) return null;

  try {
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      { params: { address: query, key, region: 'in' }, timeout: 8000 }
    );

    if (data?.status !== 'OK' || !data.results?.length) {
      console.warn('[geocode] no match for', query, '-', data?.status);
      return null;
    }

    const point = data.results[0].geometry?.location;
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return null;

    return { latitude: point.lat, longitude: point.lng };
  } catch (error) {
    console.warn('[geocode] lookup failed:', error.message);
    return null;
  }
};

export default { geocodeAddress };
