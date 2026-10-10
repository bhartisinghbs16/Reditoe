/**
 * Customer analytics, from the customers and their orders.
 *
 * The console's Customer Analytics screen was written against fixed numbers -
 * 48,672 customers, a week in June 2024, five named people nobody had ever
 * served - so it reported the same figures whatever the business had done,
 * and its date filter had nothing to filter.
 *
 * Everything here is counted from the two collections that know. Where a
 * figure cannot honestly be derived from what is stored - which channel
 * brought someone in, for instance, when nothing records it - the section is
 * returned empty so the screen can say it has nothing rather than show a
 * number somebody might act on.
 */
import mongoose from 'mongoose';
import Order from '../../models/Order.js';
import User from '../../models/User.js';

/** Orders that never reached a kitchen are not orders for reporting purposes. */
const REAL_ORDERS = { status: { $ne: 'Payment Pending' } };
const CUSTOMERS = { role: 'user' };
const CANCELLED = ['Cancelled', 'RiderRejected'];

const DAY = 24 * 60 * 60 * 1000;

/**
 * The window being asked about, and the one before it of equal length.
 *
 * The comparison period is derived rather than passed in, so "vs previous
 * period" always means the same length of time immediately before.
 */
function windowFrom(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 29 * DAY);

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

const round = (value, places = 2) => Number(Number(value ?? 0).toFixed(places));

/**
 * The headline counts for one window.
 *
 * "Returning" means someone who ordered inside the window and had ordered at
 * least once before it began - which is what the word means to whoever reads
 * this screen, and is not the same as "has more than one order".
 */
const summarise = async (from, to) => {
  const [signups, active, orderStats] = await Promise.all([
    User.countDocuments({ ...CUSTOMERS, createdAt: { $gte: from, $lte: to } }),
    Order.distinct('userId', { ...REAL_ORDERS, createdAt: { $gte: from, $lte: to } }),
    Order.aggregate([
      { $match: { ...REAL_ORDERS, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          /*
           * Money from orders that were actually served. A cancelled order
           * is still an order the customer placed - worth counting - but it
           * is not revenue, and averaging it into spend per customer
           * overstates what the business took.
           */
          revenue: {
            $sum: {
              $cond: [{ $in: ['$status', CANCELLED] }, 0, { $ifNull: ['$total', 0] }],
            },
          },
        },
      },
    ]),
  ]);

  const activeIds = active.filter(Boolean);
  const returning = activeIds.length
    ? (
        await Order.distinct('userId', {
          ...REAL_ORDERS,
          userId: { $in: activeIds },
          createdAt: { $lt: from },
        })
      ).length
    : 0;

  const orders = orderStats[0]?.orders ?? 0;
  const revenue = orderStats[0]?.revenue ?? 0;

  return {
    newCustomers: signups,
    activeCustomers: activeIds.length,
    returningCustomers: returning,
    orders,
    revenue: round(revenue),
    ordersPerCustomer: activeIds.length ? round(orders / activeIds.length) : 0,
    revenuePerCustomer: activeIds.length ? round(revenue / activeIds.length) : 0,
  };
};

/** GET /api/admin/users/analytics */
export const getCustomerAnalytics = async (req, res) => {
  try {
    const { from, to, previousFrom, previousTo } = windowFrom(req.query);

    const [
      current,
      previous,
      totalCustomers,
      totalBefore,
      signupSeries,
      citySeries,
      referredCount,
      lifetime,
      cohortRows,
    ] = await Promise.all([
      summarise(from, to),
      summarise(previousFrom, previousTo),
      User.countDocuments(CUSTOMERS),
      User.countDocuments({ ...CUSTOMERS, createdAt: { $lt: from } }),

      // Signups per day across the window.
      User.aggregate([
        { $match: { ...CUSTOMERS, createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Where customers are. Blank cities are dropped rather than bucketed as
      // "Unknown", which would dominate the chart and say nothing.
      User.aggregate([
        { $match: { ...CUSTOMERS, city: { $nin: [null, ''] } } },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      User.countDocuments({ ...CUSTOMERS, referredBy: { $nin: [null, ''] } }),

      /*
       * Lifetime spend per customer, for segmentation and customer value.
       * Taken over all time, not the window: what someone is worth is not a
       * property of the dates being looked at.
       */
      Order.aggregate([
        { $match: REAL_ORDERS },
        {
          $group: {
            _id: '$userId',
            orders: { $sum: 1 },
            spent: {
              $sum: {
                $cond: [{ $in: ['$status', CANCELLED] }, 0, { $ifNull: ['$total', 0] }],
              },
            },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]),

      // Signup cohorts by week, with the orders each cohort placed.
      User.aggregate([
        {
          $match: {
            ...CUSTOMERS,
            createdAt: { $gte: new Date(from.getTime() - 56 * DAY), $lte: to },
          },
        },
        { $project: { createdAt: 1 } },
        {
          $lookup: {
            from: 'orders',
            let: { customer: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$userId', '$$customer'] },
                  status: { $ne: 'Payment Pending' },
                },
              },
              { $project: { createdAt: 1 } },
            ],
            as: 'orders',
          },
        },
      ]),
    ]);

    // ---- Growth: signups per day, and the running total behind them ----
    const byDay = new Map(signupSeries.map((row) => [row._id, row.count]));
    const growth = [];
    let running = totalBefore;
    for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
      const key = new Date(t).toISOString().slice(0, 10);
      const fresh = byDay.get(key) ?? 0;
      running += fresh;
      growth.push({ date: key, newCustomers: fresh, totalCustomers: running });
    }

    // ---- Segments, by what each customer has actually spent ----
    const staleBefore = Date.now() - 30 * DAY;
    const segments = {
      high: 0,
      medium: 0,
      low: 0,
      atRisk: 0,
      neverOrdered: Math.max(0, totalCustomers - lifetime.length),
    };
    let lifetimeTotal = 0;
    for (const row of lifetime) {
      lifetimeTotal += row.spent;
      if (row.spent > 5000) segments.high += 1;
      else if (row.spent >= 1000) segments.medium += 1;
      else segments.low += 1;
      if (new Date(row.lastOrderAt).getTime() < staleBefore) segments.atRisk += 1;
    }

    // ---- Retention: of each signup week, who ordered within N days ----
    const WINDOWS = [1, 7, 15, 30, 60];
    const cohortMap = new Map();
    for (const customer of cohortRows) {
      const signedUp = new Date(customer.createdAt);
      // Week beginning Monday, so a cohort is a recognisable calendar week.
      const monday = new Date(signedUp);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);

      const bucket =
        cohortMap.get(key) ?? { week: key, size: 0, retained: WINDOWS.map(() => 0) };
      bucket.size += 1;

      for (const [index, days] of WINDOWS.entries()) {
        const deadline = signedUp.getTime() + days * DAY;
        // Only count a window that has actually elapsed, or every recent
        // cohort reads as a collapse in retention.
        if (deadline > Date.now()) {
          bucket.retained[index] = null;
          continue;
        }
        if (bucket.retained[index] === null) continue;
        const ordered = customer.orders?.some(
          (order) =>
            new Date(order.createdAt).getTime() > signedUp.getTime() &&
            new Date(order.createdAt).getTime() <= deadline
        );
        if (ordered) bucket.retained[index] += 1;
      }
      cohortMap.set(key, bucket);
    }

    const cohorts = [...cohortMap.values()]
      .sort((a, b) => (a.week < b.week ? 1 : -1))
      .slice(0, 6)
      .map((row) => ({
        week: row.week,
        size: row.size,
        retention: row.retained.map((count) =>
          count === null || !row.size ? null : round((count / row.size) * 100, 1)
        ),
      }));

    // ---- Top customers, by what they spent inside the window ----
    const topRows = await Order.aggregate([
      { $match: { ...REAL_ORDERS, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$userId',
          orders: { $sum: 1 },
          spent: {
            $sum: {
              $cond: [{ $in: ['$status', CANCELLED] }, 0, { $ifNull: ['$total', 0] }],
            },
          },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
      { $sort: { spent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    ]);

    const topCustomers = topRows
      .filter((row) => row.customer)
      .map((row) => ({
        id: row._id,
        name: row.customer?.name ?? 'Unnamed',
        email: row.customer?.email ?? '',
        phone: row.customer?.phone ?? '',
        orders: row.orders,
        spent: round(row.spent),
        averageOrderValue: row.orders ? round(row.spent / row.orders) : 0,
        lastOrderAt: row.lastOrderAt,
        customerSince: row.customer?.createdAt ?? null,
      }));

    const change = (now, before) =>
      before > 0 ? round(((now - before) / before) * 100, 1) : null;

    return res.json({
      status: 'success',
      data: {
        range: { from, to, previousFrom, previousTo },
        totals: {
          totalCustomers,
          ...current,
          previous,
          change: {
            newCustomers: change(current.newCustomers, previous.newCustomers),
            activeCustomers: change(current.activeCustomers, previous.activeCustomers),
            returningCustomers: change(
              current.returningCustomers,
              previous.returningCustomers
            ),
            revenue: change(current.revenue, previous.revenue),
            ordersPerCustomer: change(
              current.ordersPerCustomer,
              previous.ordersPerCustomer
            ),
          },
        },
        growth,
        /*
         * Acquisition, as far as anything is recorded. Only referrals are
         * known; there is no field saying whether somebody arrived from an
         * advert or a search, so the rest is honestly one bucket.
         */
        acquisition: [
          { label: 'Referred by a customer', value: referredCount },
          { label: 'Signed up directly', value: Math.max(0, totalCustomers - referredCount) },
        ],
        cities: citySeries.map((row) => ({ label: row._id, value: row.count })),
        segments,
        customerValue: {
          averageLifetimeSpend: lifetime.length ? round(lifetimeTotal / lifetime.length) : 0,
          customersWithOrders: lifetime.length,
          totalLifetimeSpend: round(lifetimeTotal),
        },
        cohorts,
        cohortWindows: WINDOWS,
        topCustomers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not build customer analytics',
    });
  }
};

export default { getCustomerAnalytics };
