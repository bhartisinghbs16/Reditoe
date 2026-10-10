import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';

/**
 * The places this platform actually operates in.
 *
 * Read from the data rather than kept as a list somebody has to maintain: a
 * filter offering a city with no orders in it, or missing one that has them,
 * is worse than no filter. Gathered from the three places a location is
 * recorded - where orders went, where customers live, where restaurants are.
 */
export const getKnownLocations = async (req, res) => {
  try {
    const [orderCities, orderStates, customerCities, customerStates, vendorCities, vendorStates] =
      await Promise.all([
        Order.distinct('deliveryAddress.city'),
        Order.distinct('deliveryAddress.state'),
        User.distinct('savedAddresses.city', { role: 'user' }),
        User.distinct('savedAddresses.state', { role: 'user' }),
        Restaurant.distinct('address.city'),
        Restaurant.distinct('address.state'),
      ]);

    /**
     * The same place is typed a dozen ways - "tirupati", "Tirupati ", "TIRUPATI".
     * Compared without case or surrounding space so it appears once, keeping
     * the tidiest spelling seen rather than whichever happened to be first.
     */
    const tidy = (values) => {
      const best = new Map();
      for (const raw of values.flat()) {
        const name = String(raw ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const held = best.get(key);
        // Prefer a properly capitalised spelling over a shouted or lowercase one.
        if (!held || (held === held.toLowerCase() && name !== name.toLowerCase())) {
          best.set(key, name);
        }
      }
      return [...best.values()].sort((a, b) => a.localeCompare(b));
    };

    return res.status(200).json({
      status: 'success',
      data: {
        cities: tidy([orderCities, customerCities, vendorCities]),
        states: tidy([orderStates, customerStates, vendorStates]),
      },
    });
  } catch (error) {
    console.error('[locations] failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not read locations.' });
  }
};

export default { getKnownLocations };
