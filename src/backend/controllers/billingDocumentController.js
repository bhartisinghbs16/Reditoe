/**
 * Invoice downloads for a delivered order.
 *
 * One document, three ways to ask for it:
 *   customer   all three sheets - the bill, the restaurant invoice, the Reditoe invoice
 *   vendor     the restaurant's own tax invoice only; it carries no customer phone number
 *   admin      all three sheets, for any order
 *
 * The vendor's earnings & payout statement is a document of its own: one PDF
 * for a restaurant over a period (statement, tax invoice on Reditoe's fees,
 * day-wise and order-wise sheets), asked for by date range.
 *
 * An invoice exists only once the order has been delivered. Before that the
 * answer is a 409 with a plain reason, not a half-filled PDF.
 */
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import Refund from '../models/Refund.js';
import PaymentLog from '../models/PaymentLog.js';
import Settings from '../models/Settings.js';
import VendorKYC from '../models/VendorKYC.js';
import { buildInvoiceData, renderCustomerInvoice } from '../utils/billing/customerInvoice.js';
import { buildVendorStatementData, renderVendorStatement } from '../utils/billing/vendorStatement.js';
import {
  signInvoiceLinkToken, verifyInvoiceLinkToken, signStatementLinkToken, verifyStatementLinkToken,
} from '../utils/jwt.js';

const clean = (ref) => String(ref || '').replace(/^#/, '').trim();

async function findOrder(ref) {
  const key = clean(ref);
  if (!key) return null;
  const populate = (q) => q
    .populate('restaurantId')
    .populate('userId', 'name phone');
  if (mongoose.Types.ObjectId.isValid(key)) {
    const byId = await populate(Order.findById(key));
    if (byId) return byId;
  }
  return populate(Order.findOne({ orderNumber: key }));
}

function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(buffer);
}

const notDelivered = (res) => res.status(409).json({
  status: 'error',
  message: 'The invoice is generated once the order has been delivered.',
});

function build(order) {
  const restaurant = order.restaurantId && order.restaurantId._id ? order.restaurantId : null;
  const data = buildInvoiceData(order, { restaurant, customer: order.userId });
  return data;
}

const fileName = (order, suffix = '') =>
  `invoice-${String(order.orderNumber || order._id).replace(/[^\w-]/g, '')}${suffix}.pdf`;

/** The PDF for an order the caller is allowed to see, or the response that says why not. */
async function respond(res, order, { pages, suffix }) {
  if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
  if (order.status !== 'Delivered') return notDelivered(res);
  const buffer = renderCustomerInvoice(build(order), { pages });
  return sendPdf(res, buffer, fileName(order, suffix));
}

const failed = (res, error, what) => {
  console.error(`[invoice] ${what} failed:`, error?.message || error);
  return res.status(500).json({ status: 'error', message: 'Could not generate the invoice' });
};

/** GET /api/orders/:orderId/invoice - the customer's own order. */
export const downloadCustomerInvoice = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order || String(order.userId?._id || order.userId) !== String(req.user._id)) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    return await respond(res, order, {});
  } catch (error) {
    return failed(res, error, 'customer download');
  }
};

/**
 * GET /api/orders/:orderId/invoice-link
 *
 * A link the app can hand to the system PDF viewer. The same rules apply as
 * for the download itself; the link is only minted for a delivered order.
 */
export const createCustomerInvoiceLink = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order || String(order.userId?._id || order.userId) !== String(req.user._id)) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    if (order.status !== 'Delivered') return notDelivered(res);

    const token = signInvoiceLinkToken(order._id, req.user._id);
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      status: 'success',
      data: { url: `${base}/api/orders/invoice-file/${token}`, expiresInSeconds: 600 },
    });
  } catch (error) {
    return failed(res, error, 'link');
  }
};

/** GET /api/orders/invoice-file/:token - no login header; the signed token is the proof. */
export const downloadInvoiceByLink = async (req, res) => {
  let claims;
  try {
    claims = verifyInvoiceLinkToken(req.params.token);
  } catch {
    return res.status(401).json({ status: 'error', message: 'This invoice link has expired. Please open it again.' });
  }
  try {
    const order = await findOrder(claims.orderId);
    if (!order || String(order.userId?._id || order.userId) !== claims.userId) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    return await respond(res, order, {});
  } catch (error) {
    return failed(res, error, 'link download');
  }
};

/** GET /admin/orders/:id/invoice */
export const downloadAdminInvoice = async (req, res) => {
  try {
    return await respond(res, await findOrder(req.params.id), {});
  } catch (error) {
    return failed(res, error, 'admin download');
  }
};

/** GET /api/vendor/orders/:orderId/invoice - the restaurant's sheet for its own order. */
export const downloadVendorInvoice = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (order) {
      const outlet = order.restaurantId?._id
        ? order.restaurantId
        : await Restaurant.findById(order.restaurantId);
      if (!outlet || String(outlet.owner) !== String(req.user._id)) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. This order does not belong to your restaurant.',
        });
      }
    }
    return await respond(res, order, { pages: ['restaurant'], suffix: '-restaurant' });
  } catch (error) {
    return failed(res, error, 'vendor download');
  }
};

/* ── Vendor earnings & payout statement ────────────────────────────────── */

const MAX_RANGE_DAYS = 366;
const MAX_ORDERS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const istDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
  && !Number.isNaN(new Date(`${v}T00:00:00+05:30`).getTime());

/** The period from `?from=YYYY-MM-DD&to=YYYY-MM-DD` (India dates), or the reason it cannot be used. */
function parsePeriod(query) {
  const to = query.to || istDate(new Date());
  const from = query.from
    || (isDay(to) ? istDate(new Date(new Date(`${to}T00:00:00+05:30`).getTime() - 29 * DAY_MS)) : '');
  if (!isDay(from) || !isDay(to)) return { error: 'Dates must be given as YYYY-MM-DD.' };
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T23:59:59.999+05:30`);
  if (start > end) return { error: 'The start date must not be after the end date.' };
  if ((end - start) / DAY_MS > MAX_RANGE_DAYS) {
    return { error: `A statement covers at most ${MAX_RANGE_DAYS} days. Choose a shorter period.` };
  }
  return { from, to, start, end };
}

/** The statement for one restaurant over a period, as PDF bytes. */
async function renderStatement(restaurantId, period) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) return { missing: true };

  const orders = await Order.find({
    restaurantId: restaurant._id,
    status: { $in: ['Delivered', 'Cancelled'] },
    createdAt: { $gte: period.start, $lte: period.end },
  }).sort({ createdAt: 1 }).limit(MAX_ORDERS + 1).lean();
  if (orders.length > MAX_ORDERS) return { tooMany: true };

  const ids = orders.map((o) => o._id);
  const [refunds, logs, settings, kyc] = await Promise.all([
    ids.length
      ? Refund.find({ orderId: { $in: ids }, refundStatus: 'approved' }).select('orderId refundAmount').lean()
      : [],
    ids.length
      ? PaymentLog.find({ orderId: { $in: ids }, method: { $exists: true } }).select('orderId method').lean()
      : [],
    Settings.getSettings(),
    VendorKYC.findOne({ $or: [{ restaurantId: restaurant._id }, { vendorId: restaurant.owner }] }).lean(),
  ]);

  const methods = {};
  logs.forEach((l) => { methods[String(l.orderId)] = l.method; });

  const gst = settings?.taxConfiguration?.gst;
  const platform = {
    gstEnabled: gst?.enabled !== false,
    gstPercent: gst?.enabled === false ? 0 : gst?.percentage ?? 5,
  };

  // Whichever bank record the vendor actually filled in, nearest to the restaurant first.
  const bank = restaurant.bankDetails?.accountNumber
    ? restaurant.bankDetails
    : restaurant.settlementInfo?.bankDetails?.accountNumber
      ? restaurant.settlementInfo.bankDetails
      : kyc?.bankInfo
        ? { ...kyc.bankInfo, ifsc: kyc.bankInfo.ifscCode }
        : {};
  const records = restaurant.documentRecords || {};
  const recordOf = (key) => (records instanceof Map ? records.get(key) : records[key]);

  const data = buildVendorStatementData({
    restaurant,
    bank,
    accountType: kyc?.bankInfo?.accountType || '',
    identity: { gstin: restaurant.gstInfo?.gstNumber || recordOf('gst')?.number || '' },
    period: { from: period.start, to: period.end },
    orders,
    refunds,
    methods,
    platform,
  });
  return { buffer: renderVendorStatement(data) };
}

async function respondStatement(res, restaurantId, period) {
  const result = await renderStatement(restaurantId, period);
  if (result.missing) return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
  if (result.tooMany) {
    return res.status(400).json({
      status: 'error',
      message: 'That period has too many orders for one statement. Choose a shorter period.',
    });
  }
  return sendPdf(res, result.buffer, `reditoe-statement-${period.from}-to-${period.to}.pdf`);
}

/** GET /api/vendor/statement?from=&to= - the restaurant's own statement. */
export const downloadVendorStatement = async (req, res) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ status: 'error', message: period.error });
    return await respondStatement(res, req.restaurantId, period);
  } catch (error) {
    return failed(res, error, 'vendor statement');
  }
};

/** GET /api/vendor/statement-link?from=&to= - a link the app can hand to the system PDF viewer. */
export const createVendorStatementLink = async (req, res) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ status: 'error', message: period.error });
    const token = signStatementLinkToken({
      restaurantId: req.restaurantId, userId: req.user._id, from: period.from, to: period.to,
    });
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      status: 'success',
      data: { url: `${base}/api/vendor/statement-file/${token}`, expiresInSeconds: 600 },
    });
  } catch (error) {
    return failed(res, error, 'statement link');
  }
};

/** GET /api/vendor/statement-file/:token - no login header; the signed token is the proof. */
export const downloadStatementByLink = async (req, res) => {
  let claims;
  try {
    claims = verifyStatementLinkToken(req.params.token);
  } catch {
    return res.status(401).json({ status: 'error', message: 'This statement link has expired. Please open it again.' });
  }
  try {
    const period = parsePeriod({ from: claims.from, to: claims.to });
    if (period.error) return res.status(400).json({ status: 'error', message: period.error });
    return await respondStatement(res, claims.restaurantId, period);
  } catch (error) {
    return failed(res, error, 'statement link download');
  }
};
