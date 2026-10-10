/**
 * Bulk menu import from a spreadsheet.
 *
 * The admin console has had an "Import Menu (XLSX)" button since the console
 * was built; it had no handler behind it and nothing happened when it was
 * pressed. This is the endpoint it needed.
 *
 * The import is deliberately all-or-nothing on validation: every row is checked
 * before any row is written. A half-imported menu is worse than a rejected file
 * — the operator cannot tell which dishes landed without reading the whole
 * menu, and re-running the import would duplicate the ones that did.
 */
import xlsx from 'xlsx';
import mongoose from 'mongoose';
import FoodItem from '../../models/FoodItem.js';
import Restaurant from '../../models/Restaurant.js';

/**
 * Column headings accepted for each field. Matching is case-insensitive and
 * ignores spaces and underscores, so "Food Type", "foodType" and "food_type"
 * are the same column — an operator should not have to guess our spelling.
 */
const COLUMNS = {
  name: ['name', 'item', 'itemname', 'dish', 'dishname'],
  price: ['price', 'mrp', 'listprice', 'amount'],
  description: ['description', 'desc', 'details'],
  category: ['category', 'section', 'menusection'],
  cuisine: ['cuisine', 'foodcuisine'],
  foodType: ['foodtype', 'type', 'vegnonveg'],
  preparationTime: ['preparationtime', 'preptime', 'prep', 'minutes'],
  discountType: ['discounttype', 'discountkind'],
  discountValue: ['discountvalue', 'discount', 'discountamount'],
  isAvailable: ['isavailable', 'available', 'inStock', 'status'],
  image: ['image', 'imageurl', 'photo'],
};

const FOOD_TYPES = ['veg', 'non-veg', 'egg'];
const DISCOUNT_TYPES = ['none', 'percent', 'flat'];

/** Normalises a heading so spelling and spacing stop mattering. */
const key = (heading) => String(heading || '').toLowerCase().replace(/[\s_-]+/g, '');

/** Maps a sheet row onto our field names using the aliases above. */
function readRow(row) {
  const byKey = {};
  for (const [heading, value] of Object.entries(row)) {
    byKey[key(heading)] = value;
  }

  const out = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const match = aliases.find((alias) => byKey[alias] !== undefined && byKey[alias] !== '');
    if (match !== undefined) out[field] = byKey[match];
  }
  return out;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['no', 'false', '0', 'unavailable', 'hidden', 'off'].includes(text)) return false;
  if (['yes', 'true', '1', 'available', 'live', 'on'].includes(text)) return true;
  return fallback;
}

/**
 * Validates one row. Returns either the item to create or the reason it cannot
 * be, reported with its spreadsheet row number so the operator can find it.
 */
function validateRow(raw, rowNumber, restaurantId) {
  const problems = [];

  const name = String(raw.name ?? '').trim();
  if (!name) problems.push('name is missing');

  const price = Number(raw.price);
  if (raw.price === undefined) problems.push('price is missing');
  else if (!Number.isFinite(price) || price < 0) problems.push(`price "${raw.price}" is not a number`);

  const foodType = String(raw.foodType ?? 'veg').trim().toLowerCase().replace(/\s+/g, '-');
  const resolvedFoodType = FOOD_TYPES.includes(foodType)
    ? foodType
    : ['nonveg', 'non veg', 'nonvegetarian'].includes(foodType.replace(/-/g, ''))
      ? 'non-veg'
      : foodType === 'vegetarian'
        ? 'veg'
        : null;
  if (resolvedFoodType === null) {
    problems.push(`food type "${raw.foodType}" is not one of ${FOOD_TYPES.join(', ')}`);
  }

  const discountType = String(raw.discountType ?? 'none').trim().toLowerCase();
  if (!DISCOUNT_TYPES.includes(discountType)) {
    problems.push(`discount type "${raw.discountType}" is not one of ${DISCOUNT_TYPES.join(', ')}`);
  }

  const discountValue = Number(raw.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    problems.push(`discount "${raw.discountValue}" is not a number`);
  } else if (discountType === 'percent' && discountValue > 100) {
    problems.push(`a percentage discount of ${discountValue} is over 100`);
  } else if (discountType === 'flat' && discountValue > price) {
    // Caught here rather than clamped silently: a ₹500 discount on a ₹200 dish
    // is a typo, and importing it as "free" would be an expensive guess.
    problems.push(`a flat discount of ${discountValue} is more than the price of ${price}`);
  }

  if (problems.length > 0) return { row: rowNumber, name, problems };

  return {
    item: {
      restaurantId,
      name,
      price,
      description: String(raw.description ?? '').trim(),
      category: String(raw.category ?? '').trim(),
      cuisine: String(raw.cuisine ?? '').trim(),
      foodType: resolvedFoodType,
      preparationTime: Number(raw.preparationTime) || 0,
      discountType,
      discountValue: discountType === 'none' ? 0 : discountValue,
      isAvailable: parseBoolean(raw.isAvailable),
      image: String(raw.image ?? '').trim(),
    },
  };
}

/**
 * POST /api/admin/restaurants/:id/menu/import
 * Multipart, field name `file`. Pass `?dryRun=1` to validate without writing —
 * the console uses this to show what will happen before it happens.
 */
export const importMenu = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ status: 'error', message: 'Invalid restaurant ID' });
    }

    const restaurant = await Restaurant.findById(id).select('_id name').lean();
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    // Works with either storage: memory keeps a buffer, disk writes a path.
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
      const workbook = buffer
        ? xlsx.read(buffer, { type: 'buffer' })
        : xlsx.readFile(path);
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

    const items = [];
    const rejected = [];
    const seen = new Set();

    sheet.forEach((row, index) => {
      // +2: one for the header row, one because spreadsheets start at 1.
      const rowNumber = index + 2;
      const result = validateRow(readRow(row), rowNumber, restaurant._id);

      if (result.problems) {
        rejected.push(result);
        return;
      }

      // A file that lists the same dish twice would otherwise create both.
      const fingerprint = result.item.name.toLowerCase();
      if (seen.has(fingerprint)) {
        rejected.push({ row: rowNumber, name: result.item.name, problems: ['appears earlier in the file'] });
        return;
      }
      seen.add(fingerprint);
      items.push(result.item);
    });

    if (rejected.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `${rejected.length} of ${sheet.length} rows could not be imported. Nothing was changed.`,
        data: { rejected, accepted: items.length, total: sheet.length },
      });
    }

    if (req.query.dryRun === '1' || req.query.dryRun === 'true') {
      return res.status(200).json({
        status: 'success',
        message: `${items.length} rows are ready to import.`,
        data: { dryRun: true, accepted: items.length, total: sheet.length, preview: items.slice(0, 5) },
      });
    }

    // Existing dishes are updated rather than duplicated, so re-importing a
    // corrected file does not leave two of everything.
    const existing = await FoodItem.find({ restaurantId: restaurant._id })
      .select('_id name')
      .lean();
    const byName = new Map(existing.map((doc) => [String(doc.name).toLowerCase(), doc._id]));

    const operations = items.map((item) => {
      const match = byName.get(item.name.toLowerCase());
      return match
        ? { updateOne: { filter: { _id: match }, update: { $set: item } } }
        : { insertOne: { document: item } };
    });

    const result = await FoodItem.bulkWrite(operations, { ordered: false });

    return res.status(200).json({
      status: 'success',
      message: `Imported ${items.length} item${items.length === 1 ? '' : 's'}.`,
      data: {
        created: result.insertedCount ?? 0,
        updated: result.modifiedCount ?? 0,
        total: items.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to import the menu',
    });
  }
};

/**
 * GET /api/admin/restaurants/menu/import-template
 * A spreadsheet with the expected headings and one example row, so the format
 * is discoverable rather than something to be guessed at or asked about.
 */
export const downloadImportTemplate = async (req, res) => {
  try {
    const example = [
      {
        name: 'Paneer Butter Masala',
        price: 260,
        description: 'Cottage cheese in a tomato and butter gravy',
        category: 'Main Course',
        cuisine: 'North Indian',
        foodType: 'veg',
        preparationTime: 20,
        discountType: 'percent',
        discountValue: 10,
        isAvailable: 'yes',
        image: '',
      },
    ];

    const sheet = xlsx.utils.json_to_sheet(example);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, 'Menu');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="menu-import-template.xlsx"');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to build the template',
    });
  }
};

export default { importMenu, downloadImportTemplate };
