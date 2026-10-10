import User from '../../models/User.js';
import { geocodeAddress } from '../../services/geocodingService.js';

/**
 * Saved delivery addresses.
 *
 * They already live on the user document as `savedAddresses`; the API had no
 * CRUD for them, so the app's Addresses screen had nothing to read or write.
 */

/** The app labels addresses Home / Work / Other / Hostel; the schema allows three. */
const LABELS = ['Home', 'Office', 'Other'];

const present = (address, defaultId) => ({
  id: address._id,
  label: address.label,
  street: address.street,
  city: address.city,
  state: address.state,
  zipCode: address.zipCode,
  country: address.country,
  coordinates: address.coordinates,
  isDefault: defaultId ? String(address._id) === String(defaultId) : false,
});

const validate = (body) => {
  const missing = ['street', 'city', 'state', 'zipCode'].filter((f) => !body[f]);
  if (missing.length) return `Missing required field(s): ${missing.join(', ')}`;
  if (body.label && !LABELS.includes(body.label)) {
    return `label must be one of: ${LABELS.join(', ')}`;
  }
  return null;
};

/** GET /api/addresses */
export const listAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('savedAddresses defaultAddressId');
    const addresses = user?.savedAddresses ?? [];

    res.json({
      status: 'success',
      results: addresses.length,
      data: {
        addresses: addresses.map((a) => present(a, user?.defaultAddressId)),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** POST /api/addresses */
export const createAddress = async (req, res) => {
  try {
    const problem = validate(req.body);
    if (problem) return res.status(400).json({ status: 'error', message: problem });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    /*
     * An address without coordinates cannot be priced.
     *
     * Delivery is charged on the distance from the restaurant, and the app
     * only captures a point when the customer taps "use my current location".
     * A typed address arrived with none, the distance came out as zero, and
     * the order was charged the base fare however far it actually went -
     * every order on the live server so far was priced that way. Looked up
     * here so it does not matter how the address was entered.
     */
    const coordinates =
      req.body.coordinates?.latitude != null
        ? req.body.coordinates
        : await geocodeAddress(req.body);

    user.savedAddresses.push({
      label: req.body.label || 'Home',
      street: req.body.street,
      city: req.body.city,
      state: req.body.state,
      zipCode: req.body.zipCode,
      country: req.body.country || 'India',
      coordinates: coordinates || undefined,
    });

    const created = user.savedAddresses[user.savedAddresses.length - 1];
    // The first address saved becomes the default, so checkout always has one.
    if (user.savedAddresses.length === 1 || req.body.isDefault) {
      user.defaultAddressId = created._id;
    }

    /*
     * Saving an address should not re-validate the whole account.
     *
     * `save()` validates every field on the document, so a customer whose
     * account predates a required field - an OTP sign-up has no email, for
     * instance - could not add an address at all: the write failed with
     * "Please provide an email", about a field they were not touching.
     */
    await user.save({ validateBeforeSave: false });
    res.status(201).json({
      status: 'success',
      data: { address: present(created, user.defaultAddressId) },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** PUT /api/addresses/:id */
export const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user?.savedAddresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ status: 'error', message: 'Address not found' });
    }

    if (req.body.label && !LABELS.includes(req.body.label)) {
      return res
        .status(400)
        .json({ status: 'error', message: `label must be one of: ${LABELS.join(', ')}` });
    }

    const movedLines = ['street', 'city', 'state', 'zipCode', 'country'].some(
      (field) => req.body[field] !== undefined && req.body[field] !== address[field]
    );

    for (const field of ['label', 'street', 'city', 'state', 'zipCode', 'country', 'coordinates']) {
      if (req.body[field] !== undefined) address[field] = req.body[field];
    }

    /*
     * Re-locate the address if the lines changed and no new point came with
     * them; otherwise it keeps the coordinates of where it used to be, and
     * the delivery is priced from the wrong place.
     */
    if (movedLines && req.body.coordinates?.latitude == null) {
      const located = await geocodeAddress(address);
      if (located) address.coordinates = located;
    }
    if (req.body.isDefault) user.defaultAddressId = address._id;

    /*
     * Saving an address should not re-validate the whole account.
     *
     * `save()` validates every field on the document, so a customer whose
     * account predates a required field - an OTP sign-up has no email, for
     * instance - could not add an address at all: the write failed with
     * "Please provide an email", about a field they were not touching.
     */
    await user.save({ validateBeforeSave: false });
    res.json({ status: 'success', data: { address: present(address, user.defaultAddressId) } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** DELETE /api/addresses/:id */
export const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user?.savedAddresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ status: 'error', message: 'Address not found' });
    }

    address.deleteOne();
    // Deleting the default promotes whatever is left, so one stays selected.
    if (String(user.defaultAddressId) === String(req.params.id)) {
      user.defaultAddressId = user.savedAddresses[0]?._id ?? undefined;
    }

    /*
     * Saving an address should not re-validate the whole account.
     *
     * `save()` validates every field on the document, so a customer whose
     * account predates a required field - an OTP sign-up has no email, for
     * instance - could not add an address at all: the write failed with
     * "Please provide an email", about a field they were not touching.
     */
    await user.save({ validateBeforeSave: false });
    res.json({ status: 'success', data: { deletedId: req.params.id } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** PATCH /api/addresses/:id/default */
export const setDefaultAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user?.savedAddresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ status: 'error', message: 'Address not found' });
    }

    user.defaultAddressId = address._id;
    /*
     * Saving an address should not re-validate the whole account.
     *
     * `save()` validates every field on the document, so a customer whose
     * account predates a required field - an OTP sign-up has no email, for
     * instance - could not add an address at all: the write failed with
     * "Please provide an email", about a field they were not touching.
     */
    await user.save({ validateBeforeSave: false });
    res.json({ status: 'success', data: { address: present(address, user.defaultAddressId) } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};
