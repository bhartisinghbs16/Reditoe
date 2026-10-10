import ServiceArea from '../../models/ServiceArea.js';
import Restaurant from '../../models/Restaurant.js';

/**
 * The cities the platform trades in.
 *
 * Distinct from a vendor's delivery radius: this decides whether the business
 * operates somewhere at all, and a restaurant in a closed city stays closed
 * however short its own radius is.
 */

/** GET /api/admin/service-areas */
export const listServiceAreas = async (req, res) => {
  try {
    const areas = await ServiceArea.find().sort({ state: 1, city: 1 }).lean();

    // Grouped for the screen, which lists states and then their cities.
    const byState = {};
    for (const area of areas) {
      byState[area.state] ??= {
        state: area.state,
        stateActive: area.stateActive,
        // Held on every city in the state; the first one answers for all.
        office: area.stateOffice ?? {},
        districts: [],
        cities: [],
      };
      byState[area.state].cities.push(area);
      if (area.district && !byState[area.state].districts.includes(area.district)) {
        byState[area.state].districts.push(area.district);
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        areas,
        states: Object.values(byState),
        summary: {
          states: Object.keys(byState).length,
          cities: areas.length,
          activeCities: areas.filter((a) => a.isActive && a.stateActive).length,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /api/admin/service-areas
 *
 * Creates or updates - a city exists once in a state, so saving it twice
 * changes it rather than adding a second.
 */
export const saveServiceArea = async (req, res) => {
  try {
    const { state, city } = req.body;

    if (!state || !city) {
      return res.status(400).json({
        status: 'error',
        message: 'State and city are both required.',
      });
    }

    const radiusKm = Number(req.body.radiusKm ?? 15);
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Service radius must be between 1 and 100 km.',
      });
    }

    const latitude = Number(req.body?.center?.latitude);
    const longitude = Number(req.body?.center?.longitude);
    const hasCentre = Number.isFinite(latitude) && Number.isFinite(longitude);

    const area = await ServiceArea.findOneAndUpdate(
      { state: state.trim(), city: city.trim() },
      {
        $set: {
          state: state.trim(),
          city: city.trim(),
          isActive: req.body.isActive !== false,
          district: String(req.body.district ?? '').trim(),
          radiusKm,
          ...(hasCentre ? { center: { latitude, longitude } } : {}),
          updatedBy: req.user?._id,
        },
        // Only on insert: a new city inherits its state's current switch
        // rather than silently reopening a state that was turned off.
        $setOnInsert: {
          stateActive: req.body.stateActive !== false,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      status: 'success',
      message: `${area.city} saved`,
      data: { area },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * GET /api/admin/service-areas/map
 *
 * Everything the coverage map draws: the cities the platform trades in, and
 * the restaurants inside them with the range each will ride.
 *
 * A restaurant with no coordinates is returned with `plotted: false` rather
 * than dropped or given a made-up position. A pin in the wrong place is worse
 * than a missing one, and the screen can say how many it could not place.
 */
export const getServiceMap = async (req, res) => {
  try {
    const [areas, restaurants] = await Promise.all([
      ServiceArea.find().sort({ state: 1, city: 1 }).lean(),
      Restaurant.find()
        .select('name address deliveryRadius status isActive gstInfo phone createdAt image')
        .lean(),
    ]);

    /*
     * Which state a restaurant is in.
     *
     * Vendors filled in a city but often not a state, so the city is matched
     * against the service areas first and the record's own state used only as
     * a fallback. Unknown stays unknown.
     */
    const stateByCity = new Map(
      areas.map((area) => [String(area.city ?? '').trim().toLowerCase(), area])
    );

    const pins = restaurants.map((restaurant) => {
      const address = restaurant.address ?? {};
      const coordinates = address.coordinates ?? {};
      const latitude = Number(coordinates.latitude);
      const longitude = Number(coordinates.longitude);
      const plotted = Number.isFinite(latitude) && Number.isFinite(longitude);
      const matched = stateByCity.get(String(address.city ?? '').trim().toLowerCase());

      return {
        id: restaurant._id,
        name: restaurant.name ?? '',
        city: address.city ?? null,
        state: matched?.state ?? address.state ?? null,
        district: matched?.district || null,
        pincode: address.zipCode ?? address.pincode ?? null,
        address: address.street ?? address.fullAddress ?? null,
        phone: restaurant.phone ?? null,
        gst: restaurant.gstInfo?.gstNumber ?? null,
        radiusKm: Number(restaurant.deliveryRadius ?? 0) || null,
        status: restaurant.status ?? null,
        registeredOn: restaurant.createdAt ?? null,
        latitude: plotted ? latitude : null,
        longitude: plotted ? longitude : null,
        plotted,
      };
    });

    const byState = {};
    for (const area of areas) {
      byState[area.state] ??= {
        state: area.state,
        stateActive: area.stateActive,
        office: area.stateOffice ?? {},
        cities: [],
        districts: [],
        restaurants: 0,
      };
      byState[area.state].cities.push({
        id: area._id,
        city: area.city,
        district: area.district || null,
        isActive: area.isActive,
        radiusKm: area.radiusKm,
        center: area.center ?? null,
      });
      if (area.district && !byState[area.state].districts.includes(area.district)) {
        byState[area.state].districts.push(area.district);
      }
    }
    for (const pin of pins) {
      if (pin.state && byState[pin.state]) byState[pin.state].restaurants += 1;
    }

    return res.status(200).json({
      status: 'success',
      data: {
        states: Object.values(byState),
        restaurants: pins,
        summary: {
          states: Object.keys(byState).length,
          cities: areas.length,
          activeCities: areas.filter((area) => area.isActive && area.stateActive).length,
          restaurants: pins.length,
          // Said out loud: a map that quietly omits vendors reads as complete.
          unplotted: pins.filter((pin) => !pin.plotted).length,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * PATCH /api/admin/service-areas/state-office
 * Body: { state, gst, officeAddress, contactPerson, contactPhone, email }
 *
 * Who and where the business is in one state.
 *
 * Written to every city in the state for the same reason the state switch is:
 * the check that needs it reads one document. Nothing is invented - a field
 * left blank stays blank, because a made-up GST number on a compliance screen
 * is worse than an empty one.
 */
export const setStateOffice = async (req, res) => {
  try {
    const state = String(req.body?.state ?? '').trim();
    if (!state) {
      return res.status(400).json({ status: 'error', message: 'State is required.' });
    }

    const office = {
      gst: String(req.body?.gst ?? '').trim(),
      officeAddress: String(req.body?.officeAddress ?? '').trim(),
      contactPerson: String(req.body?.contactPerson ?? '').trim(),
      contactPhone: String(req.body?.contactPhone ?? '').trim(),
      email: String(req.body?.email ?? '').trim(),
    };

    if (office.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(office.email)) {
      return res.status(400).json({ status: 'error', message: 'That email address is not valid.' });
    }

    const result = await ServiceArea.updateMany(
      { state },
      { $set: { stateOffice: office, updatedBy: req.user?._id } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: `No cities are set up in ${state} yet. Add one first.`,
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `${state} office details saved`,
      data: { state, office, cities: result.matchedCount },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * PATCH /api/admin/service-areas/state
 *
 * Turns a whole state on or off. Written to every city in it, because the
 * flag is held on the city records so a serviceability check reads one
 * document rather than joining.
 */
export const setStateActive = async (req, res) => {
  try {
    const { state, stateActive } = req.body;

    if (!state || typeof stateActive !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'A state and whether it is active are both required.',
      });
    }

    const result = await ServiceArea.updateMany(
      { state: state.trim() },
      { $set: { stateActive, updatedBy: req.user?._id } }
    );

    return res.status(200).json({
      status: 'success',
      message: `${state} is now ${stateActive ? 'serviceable' : 'not serviceable'}`,
      data: { citiesUpdated: result.modifiedCount },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/** DELETE /api/admin/service-areas/:id */
export const deleteServiceArea = async (req, res) => {
  try {
    const area = await ServiceArea.findByIdAndDelete(req.params.id);
    if (!area) {
      return res.status(404).json({ status: 'error', message: 'No such service area.' });
    }
    return res.status(200).json({ status: 'success', message: `${area.city} removed` });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export default {
  listServiceAreas,
  saveServiceArea,
  setStateActive,
  deleteServiceArea,
};
