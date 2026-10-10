/**
 * Check if Review orderIds exist in Order collection and have orderNumber
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

  const reviews = await Review.find({}).select('orderId').lean();
  const orderIds = [...new Set(reviews.map((r) => r.orderId?.toString?.()).filter(Boolean))];

  const orders = await Order.find({ _id: { $in: orderIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select('orderNumber _id')
    .lean();

  const foundIds = new Set(orders.map((o) => o._id.toString()));
  const missing = orderIds.filter((id) => !foundIds.has(id));
  const withNum = orders.filter((o) => o.orderNumber);

  console.log('Reviews count:', reviews.length);
  console.log('Unique orderIds in reviews:', orderIds.length);
  console.log('Orders found:', orders.length);
  console.log('Orders with orderNumber:', withNum.length);
  console.log('Missing (review orderId not in Order):', missing.length, missing.slice(0, 3));
  console.log('Sample orderNumbers:', withNum.slice(0, 5).map((o) => o.orderNumber));

  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
