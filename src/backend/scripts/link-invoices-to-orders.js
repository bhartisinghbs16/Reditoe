/**
 * Link invoices to real orders and fix customer/vendor references.
 * Seed invoices use fake ObjectIds; this script assigns real orderId, customerId, vendorId.
 * Run: node scripts/link-invoices-to-orders.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Order from '../models/Order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const invoices = await Invoice.find({}).sort({ createdAt: 1 }).lean();
  const orders = await Order.find({})
    .sort({ createdAt: 1 })
    .select('_id orderNumber userId restaurantId')
    .lean();

  if (orders.length === 0) {
    console.log('No orders found. Create orders first, then run this script.');
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  const validOrderIds = new Set(orders.map((o) => o._id.toString()));

  let linked = 0;
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const orderIdStr = inv.orderId?.toString?.();
    let order = null;

    if (orderIdStr && validOrderIds.has(orderIdStr)) {
      order = orders.find((o) => o._id.toString() === orderIdStr);
    }
    if (!order) {
      order = orders[i % orders.length];
    }

    const customerId = order.userId;
    const vendorId = order.restaurantId;

    if (!customerId || !vendorId) {
      console.warn(`Skipping invoice ${inv.invoiceNumber}: order ${order.orderNumber || order._id} missing userId or restaurantId`);
      continue;
    }

    await Invoice.updateOne(
      { _id: inv._id },
      {
        $set: {
          orderId: order._id,
          customerId,
          vendorId,
        },
      }
    );
    linked++;
    console.log(`Linked invoice ${inv.invoiceNumber} -> order ${order.orderNumber || order._id}`);
  }

  console.log(`Done. Linked ${linked} invoices to real orders with customer and vendor data.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
