/**
 * Customer groups for the admin console.
 *
 * These are computed segments, not a stored collection. Every group is a query
 * over users and their orders, so the counts are always current — there is no
 * membership table to fall out of date, and nothing to re-run after a night of
 * trading.
 *
 * A stored CustomerGroup collection would be needed for hand-picked lists
 * ("VIPs we met at the launch"), which these can't express. The screen's
 * Create Group action is that feature, and it needs a model before it can work.
 *
 * The route has to be declared before `/:id` in usersRoutes, or Express matches
 * "groups" as a user id and rejects it as malformed.
 */
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Order from '../../models/Order.js';

/** Orders that represent real, completed trade. */
const COMPLETED = ['Delivered', 'delivered', 'completed'];

/** Spend above this marks a customer as high value. */
const HIGH_VALUE_SPEND = 5000;

/** No order in this many days counts as lapsed. */
const LAPSED_DAYS = 60;

/** Recently joined window, in days. */
const NEW_JOINER_DAYS = 30;

/**
 * Per-customer order totals, computed once and shared by every segment. One
 * aggregate beats six separate count queries and keeps the segments mutually
 * consistent — they all read the same numbers.
 */
async function buildCustomerStats() {
  const rows = await Order.aggregate([
    { $match: { userId: { $ne: null } } },
    {
      $group: {
        _id: '$userId',
        orderCount: { $sum: 1 },
        completedCount: {
          $sum: { $cond: [{ $in: ['$status', COMPLETED] }, 1, 0] },
        },
        totalSpent: {
          $sum: { $cond: [{ $in: ['$status', COMPLETED] }, '$total', 0] },
        },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);

  const byUser = new Map();
  for (const row of rows) {
    byUser.set(String(row._id), row);
  }
  return byUser;
}

/**
 * GET /api/admin/users/groups
 */
export const getCustomerGroups = async (req, res) => {
  try {
    const customers = await User.find({ role: 'user' })
      .select('_id isBlocked createdAt')
      .lean();

    const stats = await buildCustomerStats();

    const now = Date.now();
    const lapsedBefore = now - LAPSED_DAYS * 86400000;
    const newJoinerAfter = now - NEW_JOINER_DAYS * 86400000;

    let neverOrdered = 0;
    let oneOrder = 0;
    let repeat = 0;
    let highValue = 0;
    let lapsed = 0;
    let recentlyJoined = 0;
    let blocked = 0;

    for (const customer of customers) {
      const stat = stats.get(String(customer._id));
      const orders = stat?.completedCount ?? 0;
      const spent = stat?.totalSpent ?? 0;
      const lastOrderAt = stat?.lastOrderAt
        ? new Date(stat.lastOrderAt).getTime()
        : null;

      if (customer.isBlocked) blocked += 1;
      if (orders === 0) neverOrdered += 1;
      if (orders === 1) oneOrder += 1;
      if (orders > 1) repeat += 1;
      if (spent >= HIGH_VALUE_SPEND) highValue += 1;
      if (lastOrderAt !== null && lastOrderAt < lapsedBefore) lapsed += 1;
      if (new Date(customer.createdAt).getTime() >= newJoinerAfter) {
        recentlyJoined += 1;
      }
    }

    const total = customers.length;

    const groups = [
      {
        _id: 'all-customers',
        name: 'All customers',
        description: 'Every registered customer account.',
        criteria: 'role = user',
        customerCount: total,
        isActive: true,
        isDefault: true,
      },
      {
        _id: 'never-ordered',
        name: 'Never ordered',
        description: 'Signed up but has not completed an order.',
        criteria: 'completed orders = 0',
        customerCount: neverOrdered,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'first-time',
        name: 'First-time buyers',
        description: 'Exactly one completed order — the group worth converting.',
        criteria: 'completed orders = 1',
        customerCount: oneOrder,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'repeat',
        name: 'Repeat customers',
        description: 'More than one completed order.',
        criteria: 'completed orders > 1',
        customerCount: repeat,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'high-value',
        name: 'High value',
        description: `Lifetime spend of ₹${HIGH_VALUE_SPEND.toLocaleString('en-IN')} or more.`,
        criteria: `total spent >= ${HIGH_VALUE_SPEND}`,
        customerCount: highValue,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'lapsed',
        name: 'Lapsed',
        description: `Ordered before, but nothing in ${LAPSED_DAYS} days.`,
        criteria: `last order older than ${LAPSED_DAYS} days`,
        customerCount: lapsed,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'recently-joined',
        name: 'Recently joined',
        description: `Signed up in the last ${NEW_JOINER_DAYS} days.`,
        criteria: `created within ${NEW_JOINER_DAYS} days`,
        customerCount: recentlyJoined,
        isActive: true,
        isDefault: false,
      },
      {
        _id: 'blocked',
        name: 'Blocked',
        description: 'Accounts blocked by an admin.',
        criteria: 'isBlocked = true',
        customerCount: blocked,
        isActive: false,
        isDefault: false,
      },
    ];

    return res.status(200).json({
      status: 'success',
      data: { groups },
      total: groups.length,
      page: 1,
      totalPages: 1,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to build customer groups',
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/users/groups/:groupId/members
 * The customers a segment actually contains, so a group can be opened rather
 * than only counted.
 */
export const getCustomerGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 25 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || 25);

    const customers = await User.find({ role: 'user' })
      .select('_id name email phone isBlocked createdAt walletBalance')
      .lean();
    const stats = await buildCustomerStats();

    const now = Date.now();
    const matches = customers.filter((customer) => {
      const stat = stats.get(String(customer._id));
      const orders = stat?.completedCount ?? 0;
      const spent = stat?.totalSpent ?? 0;
      const lastOrderAt = stat?.lastOrderAt
        ? new Date(stat.lastOrderAt).getTime()
        : null;

      switch (groupId) {
        case 'all-customers':
          return true;
        case 'never-ordered':
          return orders === 0;
        case 'first-time':
          return orders === 1;
        case 'repeat':
          return orders > 1;
        case 'high-value':
          return spent >= HIGH_VALUE_SPEND;
        case 'lapsed':
          return lastOrderAt !== null && lastOrderAt < now - LAPSED_DAYS * 86400000;
        case 'recently-joined':
          return (
            new Date(customer.createdAt).getTime() >=
            now - NEW_JOINER_DAYS * 86400000
          );
        case 'blocked':
          return Boolean(customer.isBlocked);
        default:
          return false;
      }
    });

    const start = (pageNumber - 1) * limitNumber;
    const paged = matches.slice(start, start + limitNumber).map((customer) => {
      const stat = stats.get(String(customer._id));
      return {
        ...customer,
        totalOrders: stat?.completedCount ?? 0,
        totalSpent: stat?.totalSpent ?? 0,
      };
    });

    return res.status(200).json({
      status: 'success',
      data: { users: paged },
      total: matches.length,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(matches.length / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch group members',
      error: error.message,
    });
  }
};

export default { getCustomerGroups, getCustomerGroupMembers };
