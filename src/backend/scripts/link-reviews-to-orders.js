/**
 * Link reviews with orphaned orderIds to real orders.
 * Reviews use seed data with non-existent restaurants; assign to real orders by index.
 * Run: node scripts/link-reviews-to-orders.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Order from '../models/Order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const reviews = await Review.find({}).sort({ createdAt: 1 }).lean();
  const orders = await Order.find({}).sort({ createdAt: 1 }).select('_id orderNumber').lean();
  const orderIds = new Set(orders.map((o) => o._id.toString()));

  let linked = 0;
  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i];
    const oid = review.orderId?.toString?.();
    if (!oid) continue;
    if (orderIds.has(oid)) continue;

    const order = orders[i % orders.length];
    if (order) {
      await Review.updateOne({ _id: review._id }, { $set: { orderId: order._id } });
      linked++;
      console.log(`Linked review ${review._id} -> order ${order.orderNumber || order._id}`);
    }
  }

  console.log(`Done. Linked ${linked} reviews to real orders (AAA-111 format).`);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
