/**
 * Order analytics, from the orders themselves.
 *
 * The console's Order Analytics screen was written against fixed numbers -
 * 12,548 orders, a week in May 2024, a list of restaurants nobody had ordered
 * from - so it reported the same figures whatever had actually happened, and
 * its date filter had nothing to filter. This answers the same questions from
 * the order collection.
 *
 * Everything here is counted or summed from real orders. Where a figure
 * cannot honestly be derived it is absent rather than invented: the screen can
 * say it has nothing to show, which is true, instead of showing a number
 * somebody might act on.
 */
import mongoose from 'mongoose';
import Order from '../../models/Order.js';

/** Orders that never reached a kitchen are not orders for reporting purposes. */
const REAL_ORDERS = { status: { $ne: 'Payment Pending' } };

const CANCELLED = ['Cancelled', 'RiderRejected'];
const DELIVERED = ['Delivered'];

/**
 * The window being asked about, and the one before it of equal length.
 *
 * The comparison period is derived rather than passed in, so "vs previous
 * period" always means the same length of time immediately before - which is
 * the only comparison that is not misleading.
 */
function windowFrom(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);

  // Whole days, so a range reads the same whatever time it was requested at.
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const span = to.getTime() - from.getTime();
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - span),
    previousTo: new Date(from.getTime() - 1),
  };
}

const summarise = async (from, to) => {
  const [row] = await Order.aggregate([
    { $match: { ...REAL_ORDERS, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$total', 0] } },
        delivered: { $sum: { $cond: [{ $in: ['$status', DELIVERED] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $in: ['$status', CANCELLED] }, 1, 0] } },
      },
    },
  ]);
  const orders = row?.orders ?? 0;
  return {
    orders,
    revenue: Number((row?.revenue ?? 0).toFixed(2)),
    delivered: row?.delivered ?? 0,
    cancelled: row?.cancelled ?? 0,
    averageOrderValue: orders ? Number(((row.revenue ?? 0) / orders).toFixed(2)) : 0,
    cancellationRate: orders ? Number(((row.cancelled / orders) * 100).toFixed(1)) : 0,
  };
};

/** GET /admin/orders/analytics?from=&to= */
export const getOrderAnalytics = async (req, res) => {
  try {
    const { from, to, previousFrom, previousTo } = windowFrom(req.query);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ status: 'error', message: 'Invalid date range' });
    }

    const inWindow = { ...REAL_ORDERS, createdAt: { $gte: from, $lte: to } };

    const [current, previous, byDay, byStatus, byPayment, topRestaurants, cancellations] =
      await Promise.all([
        summarise(from, to),
        summarise(previousFrom, previousTo),

        Order.aggregate([
          { $match: inWindow },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        Order.aggregate([
          { $match: inWindow },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),

        Order.aggregate([
          { $match: inWindow },
          { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: { $ifNull: ['$total', 0] } } } },
          { $sort: { count: -1 } },
        ]),

        Order.aggregate([
          { $match: inWindow },
          {
            $group: {
              _id: '$restaurantId',
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
          { $sort: { orders: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'restaurants',
              localField: '_id',
              foreignField: '_id',
              as: 'restaurant',
            },
          },
          {
            $project: {
              _id: 0,
              restaurantId: '$_id',
              orders: 1,
              revenue: 1,
              name: { $first: '$restaurant.name' },
            },
          },
        ]),

        // The reasons customers actually gave, not a fixed 60/30/10 split.
        Order.aggregate([
          { $match: { ...inWindow, status: { $in: CANCELLED } } },
          { $group: { _id: { $ifNull: ['$cancellationReason', 'Not given'] }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
      ]);

    /** Change against the previous window, or null when there is nothing to compare to. */
    const delta = (now, before) =>
      before > 0 ? Number((((now - before) / before) * 100).toFixed(1)) : null;

    return res.json({
      status: 'success',
      data: {
        range: { from, to, previousFrom, previousTo },
        totals: current,
        previous,
        change: {
          orders: delta(current.orders, previous.orders),
          revenue: delta(current.revenue, previous.revenue),
          averageOrderValue: delta(current.averageOrderValue, previous.averageOrderValue),
          delivered: delta(current.delivered, previous.delivered),
          cancelled: delta(current.cancelled, previous.cancelled),
        },
        daily: byDay.map((day) => ({
          date: day._id,
          orders: day.orders,
          revenue: Number(day.revenue.toFixed(2)),
        })),
        statusBreakdown: byStatus.map((entry) => ({
          status: entry._id ?? 'Unknown',
          count: entry.count,
          percentage: current.orders
            ? Number(((entry.count / current.orders) * 100).toFixed(1))
            : 0,
        })),
        paymentBreakdown: byPayment.map((entry) => ({
          method: entry._id ?? 'Unknown',
          count: entry.count,
          revenue: Number(entry.revenue.toFixed(2)),
        })),
        topRestaurants: topRestaurants.map((entry) => ({
          restaurantId: entry.restaurantId,
          name: entry.name ?? 'Unknown restaurant',
          orders: entry.orders,
          revenue: Number(entry.revenue.toFixed(2)),
        })),
        cancellationReasons: cancellations.map((entry) => ({
          reason: entry._id,
          count: entry.count,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to build order analytics',
    });
  }
};

export default { getOrderAnalytics };
