import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Restaurant from '../../models/Restaurant.js';

/**
 * Adding restaurants from a spreadsheet.
 *
 * The console has had an "Import Restaurants" button since it was designed
 * and nothing behind it. Onboarding a city's worth of kitchens one form at a
 * time is the kind of work a spreadsheet exists for.
 *
 * Follows the menu import already here: every row is checked before a single
 * one is written, and a file with any bad row is refused in full with the row
 * numbers. A half-imported list is worse than a rejected one - somebody has
 * to work out which half.
 */

/** The columns, and the spellings a person might reasonably use for each. */
const COLUMNS = {
  name: ['name', 'restaurant', 'restaurant name', 'restaurantname'],
  phone: ['phone', 'mobile', 'contact', 'phone number'],
  street: ['street', 'address', 'address line', 'street address'],
  city: ['city', 'town'],
  state: ['state'],
  zipCode: ['zip', 'zipcode', 'pincode', 'pin code', 'postal code'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'long', 'longitude '],
  cuisine: ['cuisine', 'cuisines', 'category', 'categories'],
  deliveryRadius: ['radius', 'delivery radius', 'delivery radius km', 'radius km'],
  commissionPercent: ['commission', 'commission percent', 'commission %'],
  openingHours: ['hours', 'opening hours', 'timings'],
};

/**
 * Reads one row regardless of how its headings were capitalised or spaced.
 * A file exported from Excel rarely matches a template exactly.
 */
const readRow = (row) => {
  const byKey = new Map();
  for (const [key, value] of Object.entries(row)) {
    byKey.set(String(key).trim().toLowerCase(), value);
  }

  const pick = (names) => {
    for (const name of names) {
      const value = byKey.get(name);
      if (value !== undefined && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  };

  const out = {};
  for (const [field, names] of Object.entries(COLUMNS)) out[field] = pick(names);
  return out;
};

const number = (value) => {
  if (value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const validateRow = (raw, rowNumber) => {
  const problems = [];

  if (!raw.name) problems.push('name is missing');
  if (raw.name && raw.name.length > 120) problems.push('name is too long');

  // A phone number is how a kitchen is reached about an order, so a wrong one
  // is worse than a missing one.
  const digits = raw.phone.replace(/\D/g, '');
  if (raw.phone && (digits.length < 10 || digits.length > 12)) {
    problems.push(`phone "${raw.phone}" does not look like a number`);
  }

  const lat = number(raw.latitude);
  const lng = number(raw.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) problems.push('latitude/longitude are not numbers');
  if (lat !== null && (lat < -90 || lat > 90)) problems.push('latitude is out of range');
  if (lng !== null && (lng < -180 || lng > 180)) problems.push('longitude is out of range');

  /**
   * Without a location a restaurant cannot be matched to a customer's
   * address, so it would be listed to nobody. Said plainly rather than
   * importing something that will never take an order.
   */
  if (lat === null || lng === null) {
    problems.push('latitude and longitude are required, or the restaurant cannot be found by customers');
  }

  const radius = number(raw.deliveryRadius);
  if (Number.isNaN(radius) || (radius !== null && radius < 0)) problems.push('delivery radius is not a number');

  const commission = number(raw.commissionPercent);
  if (Number.isNaN(commission) || (commission !== null && (commission < 0 || commission > 100))) {
    problems.push('commission must be between 0 and 100');
  }

  if (problems.length) return { row: rowNumber, name: raw.name || '(no name)', problems };

  return {
    restaurant: {
      name: raw.name,
      phone: raw.phone || undefined,
      address: {
        street: raw.street || undefined,
        city: raw.city || undefined,
        state: raw.state || undefined,
        zipCode: raw.zipCode || undefined,
        coordinates: { latitude: lat, longitude: lng },
      },
      categories: raw.cuisine
        ? raw.cuisine.split(/[,;|]/).map((c) => c.trim()).filter(Boolean)
        : [],
      openingHours: raw.openingHours || undefined,
      ...(radius !== null ? { deliveryRadius: radius } : {}),
      ...(commission !== null ? { commissionPercent: commission } : {}),
      /**
       * Imported restaurants arrive switched off and awaiting KYC. A
       * spreadsheet is a list of leads, not a list of approvals, and nobody
       * should be able to put a kitchen live by uploading a file.
       */
      isEnabled: false,
      isApproved: false,
      kycStatus: 'pending',
    },
  };
};

/** GET /admin/restaurants/import-template - a spreadsheet with the right headings. */
export const downloadRestaurantTemplate = async (req, res) => {
  const example = [
    {
      Name: 'Corner Kitchen',
      Phone: '9876543210',
      Street: '18 Tiruchanoor Road',
      City: 'Tirupati',
      State: 'Andhra Pradesh',
      Pincode: '517501',
      Latitude: 13.6288,
      Longitude: 79.4192,
      Cuisine: 'Biryani, South Indian',
      'Delivery Radius': 5,
      Commission: 10,
      'Opening Hours': '10:00 AM - 11:00 PM',
    },
  ];

  const sheet = xlsx.utils.json_to_sheet(example);
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, 'Restaurants');
  const buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reditoe-restaurant-import-template.xlsx"');
  return res.send(buffer);
};

/** POST /admin/restaurants/import - the file itself. */
export const importRestaurants = async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    const path = req.file?.path;
    if (!buffer && !path) {
      return res.status(400).json({
        status: 'error',
        message: 'Attach a spreadsheet as the "file" field',
      });
    }

    let sheet;
    try {
      const workbook = buffer ? xlsx.read(buffer, { type: 'buffer' }) : xlsx.readFile(path);
      const first = workbook.SheetNames[0];
      if (!first) throw new Error('the workbook has no sheets');
      sheet = xlsx.utils.sheet_to_json(workbook.Sheets[first], { defval: '' });
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        message: `Could not read that file as a spreadsheet: ${error.message}`,
      });
    }

    if (sheet.length === 0) {
      return res.status(400).json({ status: 'error', message: 'That sheet has no rows' });
    }
    if (sheet.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: `That file has ${sheet.length} rows. Please split it into files of 500 or fewer.`,
      });
    }

    const ready = [];
    const rejected = [];
    const seen = new Set();

    sheet.forEach((row, index) => {
      // +2: one for the header row, one because spreadsheets count from 1.
      const rowNumber = index + 2;
      const result = validateRow(readRow(row), rowNumber);

      if (result.problems) {
        rejected.push(result);
        return;
      }

      const fingerprint = result.restaurant.name.toLowerCase();
      if (seen.has(fingerprint)) {
        rejected.push({
          row: rowNumber,
          name: result.restaurant.name,
          problems: ['appears earlier in the same file'],
        });
        return;
      }
      seen.add(fingerprint);
      ready.push(result.restaurant);
    });

    /**
     * Nothing is written if anything is wrong. A part-imported list leaves
     * somebody working out which half arrived.
     */
    if (rejected.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `${rejected.length} row${rejected.length === 1 ? '' : 's'} could not be imported. Nothing was saved.`,
        data: { rejected },
      });
    }

    // A restaurant already on the platform is left exactly as it is: an
    // import should never quietly rewrite terms somebody negotiated.
    const names = ready.map((r) => r.name);
    const existing = await Restaurant.find({
      name: { $in: names.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
    })
      .select('name')
      .lean();

    const already = new Set(existing.map((r) => r.name.toLowerCase()));
    const fresh = ready.filter((r) => !already.has(r.name.toLowerCase()));

    const created = fresh.length ? await Restaurant.insertMany(fresh) : [];

    return res.status(200).json({
      status: 'success',
      message: `Imported ${created.length} restaurant${created.length === 1 ? '' : 's'}.`,
      data: {
        imported: created.length,
        skipped: ready.length - fresh.length,
        skippedNames: [...already],
        note: 'Imported restaurants are switched off and awaiting KYC approval.',
      },
    });
  } catch (error) {
    console.error('[restaurant import] failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not import that file.' });
  }
};

export default { importRestaurants, downloadRestaurantTemplate };
