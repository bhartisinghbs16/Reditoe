import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI.replace(/"/g, ''));

const db = mongoose.connection.db;

// Get all order IDs that are already in a settlement
const settlements = await db.collection('vendorsettlements').find({}).toArray();
const settledIds = settlements.flatMap(s => (s.items || []).map(item => item.orderId?.toString()));

// Count Delivered orders NOT yet settled (these have unsettled earnings affected)
const unsettledOrders = await db.collection('orders').find({
  status: 'Delivered',
  _id: { $nin: settledIds.map(id => { try { return new mongoose.Types.ObjectId(id); } catch(e) { return null; }}).filter(Boolean) }
}).toArray();

// Count by restaurant
const byRestaurant = {};
for (const order of unsettledOrders) {
  const rId = order.restaurantId?.toString() || 'unknown';
  if (!byRestaurant[rId]) byRestaurant[rId] = { count: 0, totalSum: 0, subtotalSum: 0 };
  byRestaurant[rId].count++;
  byRestaurant[rId].totalSum += order.total || 0;
  byRestaurant[rId].subtotalSum += order.subtotal || 0;
}

console.log('\n=== PENDING UNSETTLED ORDERS (Affected by Bug) ===');
console.log(`Total unsettled Delivered orders: ${unsettledOrders.length}`);
console.log(`Across ${Object.keys(byRestaurant).length} restaurant(s)\n`);

// Show example: old vs new earning for first order
if (unsettledOrders.length > 0) {
  const sample = unsettledOrders[0];
  const commRate = 0.10;
  const gstRate  = 0.05;
  const oldGross = sample.total || 0;
  const newGross = sample.subtotal || 0;
  const oldEarning = oldGross - Math.round(oldGross * commRate) - Math.round(oldGross * gstRate) - Math.round(oldGross * 0.02);
  const newEarning = newGross - Math.round(newGross * commRate) - Math.round(newGross * gstRate);

  console.log('=== SAMPLE ORDER BEFORE/AFTER ===');
  console.log(`Order: ${sample.orderNumber || sample._id}`);
  console.log(`Subtotal: ₹${newGross} | Total: ₹${oldGross}`);
  console.log(`OLD vendor earning (wrong): ₹${oldEarning.toFixed(2)}`);
  console.log(`NEW vendor earning (correct): ₹${newEarning.toFixed(2)}`);
  console.log(`Difference per order: ₹${(oldEarning - newEarning).toFixed(2)} (vendor was overpaid on display)`);
}

await mongoose.connection.close();
