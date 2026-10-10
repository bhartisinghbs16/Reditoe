/**
 * Reset counter + backfill ALL orders with sequential format starting from AAA-111.
 * Format: AAA-111 -> AAA-112 -> ... -> AAA-999 -> AAB-111
 * Run from backend/: node scripts/backfill-order-numbers.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Counter from '../models/Counter.js';
import { getNextOrderNumber } from '../models/Counter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error('Ensure MongoDB is running or set MONGODB_URI in backend/.env');
    process.exit(1);
  }

  // 1. Clear ALL existing orderNumbers to avoid duplicate key errors on reassignment
  const cleared = await Order.updateMany({}, { $unset: { orderNumber: '' } });
  console.log(`Cleared orderNumber from ${cleared.modifiedCount} orders`);

  // 2. Reset counter to 0 so we start from AAA-111
  await Counter.findOneAndUpdate(
    { _id: 'orderNumber' },
    { $set: { seq: 0 } },
    { upsert: true }
  );
  console.log('Counter reset to 0 (next will be AAA-111)');

  // 3. Get ALL orders sorted by creation time (oldest first)
  const allOrders = await Order.find({}).sort({ createdAt: 1 }).lean();
  console.log(`Found ${allOrders.length} orders to update`);

  let updated = 0;
  for (const orderDoc of allOrders) {
    const order = await Order.findById(orderDoc._id);
    if (!order) continue;

    const orderNumber = await getNextOrderNumber();
    order.orderNumber = orderNumber;
    await order.save();
    updated++;
    if (updated % 50 === 0) {
      console.log(`Updated ${updated}/${allOrders.length} orders`);
    }
  }

  console.log(`Done. Assigned sequential order numbers (AAA-111, AAA-112, ...) to ${updated} orders.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
