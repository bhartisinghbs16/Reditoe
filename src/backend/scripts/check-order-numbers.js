/**
 * Quick check for orderNumber state in DB
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';
  await mongoose.connect(uri);
  const orders = await mongoose.connection.db.collection('orders').find({}).project({ orderNumber: 1, createdAt: 1 }).sort({ createdAt: 1 }).toArray();
  const withNum = orders.filter(o => o.orderNumber);
  const withoutNum = orders.filter(o => !o.orderNumber);
  const byNum = {};
  withNum.forEach(o => { byNum[o.orderNumber] = (byNum[o.orderNumber] || 0) + 1; });
  const dups = Object.entries(byNum).filter(([, v]) => v > 1);
  console.log('Total orders:', orders.length);
  console.log('With orderNumber:', withNum.length);
  console.log('Without orderNumber:', withoutNum.length);
  console.log('Duplicate orderNumbers:', dups.length, dups.slice(0, 10));
  console.log('First 5 (oldest):', orders.slice(0, 5).map(o => o.orderNumber));
  console.log('Last 5 (newest):', orders.slice(-5).map(o => o.orderNumber));
  if (withoutNum.length) console.log('Sample without:', withoutNum.slice(0, 3).map(o => ({ id: o._id, createdAt: o.createdAt })));
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
