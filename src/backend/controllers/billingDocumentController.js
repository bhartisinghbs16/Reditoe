/**
 * Invoice downloads for a delivered order.
 *
 * One document, three ways to ask for it:
 *   customer   all three sheets - the bill, the restaurant invoice, the Reditoe invoice
 *   vendor     the restaurant's own tax invoice only; it carries no customer phone number
 *   admin      all three sheets, for any order
 *
 * An invoice exists only once the order has been delivered. Before that the
 * answer is a 409 with a plain reason, not a half-filled PDF.
 */
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import { buildInvoiceData, renderCustomerInvoice } from '../utils/billing/customerInvoice.js';
import { signInvoiceLinkToken, verifyInvoiceLinkToken } from '../utils/jwt.js';

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
