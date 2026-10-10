/**
 * Restaurant categories for the admin console.
 *
 * The admin panel's Categories screen lists these alongside cuisines. The
 * route has to be declared before `/:id` in restaurantsRoutes, or Express
 * matches "categories" as a restaurant id and rejects it as malformed.
 *
 * A Category document is scoped to one restaurant — that is what the vendor
 * app reads, and it queries `{ restaurantId }` directly. The admin screen is
 * asking a different question: what categories does the platform offer. So a
 * category is treated here as a *name* spanning every restaurant that has one,
 * and each write fans out across all of them. Anything else would leave the
 * two views disagreeing: renaming a category on the admin screen would rename
 * it for one restaurant and silently leave the rest behind.
 */
import Category from '../../models/Category.js';
import Restaurant from '../../models/Restaurant.js';

const DEFAULT_LIMIT = 25;

/** Matches a name exactly but case-insensitively, with regex chars escaped. */
function exactName(name) {
  const escaped = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: `^${escaped}$`, $options: 'i' };
}

/**
 * GET /api/admin/restaurants/categories
 *
 * One row per category *name*, not per stored document — otherwise a platform
 * with 40 restaurants shows "Biryani" 40 times.
 */
export const getCategories = async (req, res) => {
  try {
    const { page = 1, limit = DEFAULT_LIMIT, search = '', isActive } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || DEFAULT_LIMIT);

    const match = {};
    if (search) {
      match.name = { $regex: String(search).trim(), $options: 'i' };
    }

    const grouped = await Category.aggregate([
      { $match: match },
      { $sort: { sortOrder: 1, createdAt: 1 } },
      {
        $group: {
          _id: { $toLower: '$name' },
          // The first document stands for the group, so the console has a
          // stable id to open and to send writes back against.
          _idRepresentative: { $first: '$_id' },
          name: { $first: '$name' },
          image: { $first: '$image' },
          sortOrder: { $min: '$sortOrder' },
          // Live somewhere means live — a category is only off when every
          // restaurant has switched it off.
          isActive: { $max: { $cond: ['$isActive', 1, 0] } },
          menuCount: { $sum: 1 },
          createdAt: { $min: '$createdAt' },
          updatedAt: { $max: '$updatedAt' },
        },
      },
      { $sort: { sortOrder: 1, name: 1 } },
    ]);

    const visible =
      isActive === 'true' || isActive === 'false'
        ? grouped.filter((row) => Boolean(row.isActive) === (isActive === 'true'))
        : grouped;

    const start = (pageNumber - 1) * limitNumber;
    const paged = visible.slice(start, start + limitNumber);

    // The console shows a usage count per category. Counting in one grouped
    // query keeps this O(1) round trips rather than one per category.
    const names = paged.map((entry) => entry.name).filter(Boolean);
    const usage = names.length
      ? await Restaurant.aggregate([
          { $unwind: '$categories' },
          { $match: { categories: { $in: names } } },
          { $group: { _id: '$categories', count: { $sum: 1 } } },
        ])
      : [];
    const usageByName = new Map(usage.map((row) => [row._id, row.count]));

    return res.status(200).json({
      status: 'success',
      data: {
        categories: paged.map((entry) => ({
          _id: entry._idRepresentative,
          name: entry.name,
          image: entry.image ?? '',
          sortOrder: entry.sortOrder ?? 0,
          isActive: Boolean(entry.isActive),
          // Restaurants tagged with this cuisine, vs restaurants carrying a
          // menu section by that name. They are different counts and the
          // screen shows the first.
          restaurantCount: usageByName.get(entry.name) ?? 0,
          menuCount: entry.menuCount,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
      },
      total: visible.length,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(visible.length / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/restaurants/categories
 *
 * Adding a category to the platform means adding it to every restaurant, since
 * that is the only place the model can hold one. Pass `restaurantId` to scope
 * it to a single restaurant instead.
 */
export const createCategory = async (req, res) => {
  try {
    const { name, image = '', isActive = true, sortOrder = 0, restaurantId } =
      req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'A category name is required',
      });
    }

    const trimmed = String(name).trim();
    const existing = await Category.findOne({
      name: exactName(trimmed),
      ...(restaurantId ? { restaurantId } : {}),
    });
    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A category with that name already exists',
      });
    }

    const restaurants = restaurantId
      ? await Restaurant.find({ _id: restaurantId }).select('_id').lean()
      : await Restaurant.find({}).select('_id').lean();

    if (restaurants.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: restaurantId
          ? 'That restaurant does not exist'
          : 'There are no restaurants to add the category to yet',
      });
    }

    const created = await Category.insertMany(
      restaurants.map((restaurant) => ({
        name: trimmed,
        image,
        isActive,
        sortOrder,
        restaurantId: restaurant._id,
      }))
    );

    return res.status(201).json({
      status: 'success',
      data: {
        category: {
          _id: created[0]._id,
          name: trimmed,
          image,
          isActive,
          sortOrder,
          restaurantCount: 0,
          menuCount: created.length,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create the category',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/admin/restaurants/categories/:categoryId
 *
 * Applies to every restaurant carrying the same category name, so the platform
 * view and the vendor apps stay in agreement. A rename also rewrites the name
 * where restaurants reference it as a cuisine tag.
 */
export const updateCategory = async (req, res) => {
  try {
    const { name, image, isActive, sortOrder } = req.body;

    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Category not found' });
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (image !== undefined) update.image = image;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;

    if (update.name && update.name.toLowerCase() !== category.name.toLowerCase()) {
      const clash = await Category.findOne({ name: exactName(update.name) });
      if (clash) {
        return res.status(409).json({
          status: 'error',
          message: 'A category with that name already exists',
        });
      }
    }

    const result = await Category.updateMany(
      { name: exactName(category.name) },
      update,
      { runValidators: true }
    );

    // Restaurants store the cuisine as a plain string, so a rename has to
    // follow it there too or their tag points at a name that no longer exists.
    if (update.name && update.name !== category.name) {
      await Restaurant.updateMany(
        { categories: category.name },
        { $set: { 'categories.$[element]': update.name } },
        { arrayFilters: [{ element: category.name }] }
      );
    }

    const updated = await Category.findById(req.params.categoryId).lean();

    return res.status(200).json({
      status: 'success',
      data: { category: updated, restaurantsUpdated: result.modifiedCount },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update the category',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/admin/restaurants/categories/:categoryId
 *
 * Refuses while restaurants still reference the category — removing it would
 * leave them pointing at a name that no longer exists.
 */
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Category not found' });
    }

    const inUse = await Restaurant.countDocuments({ categories: category.name });
    if (inUse > 0) {
      return res.status(409).json({
        status: 'error',
        message: `${inUse} restaurant${inUse === 1 ? '' : 's'} still use this category`,
      });
    }

    const result = await Category.deleteMany({ name: exactName(category.name) });
    return res.status(200).json({
      status: 'success',
      data: { deleted: true, removed: result.deletedCount },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete the category',
      error: error.message,
    });
  }
};
