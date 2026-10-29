/**
 * Invoice and payout-statement downloads, through the real routes.
 *
 *     node --test tests/invoice-documents.test.mjs
 *
 * A delivered order is created in the in-memory database and each caller
 * asks for its PDF: the customer (download and signed link), the vendor, an
 * admin, and an admin raising a rider payout statement. An order that is
 * not delivered must be refused. Set INVOICE_TEST_OUT to a folder to keep
 * the generated files for looking at.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
process.env.RAZORPAY_KEY_ID = 'rzp_test_not_a_real_key';
process.env.RAZORPAY_KEY_SECRET = 'not-a-real-secret';
delete process.env.MONGODB_URI;

const home = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-invoice-test-'));
process.chdir(scratch);

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { seedTestRestaurant, TEST_OUTLET_ID } = await import('../scripts/seed-test-restaurant.mjs');
const { default: orderRoutes } = await import('../routes/orderRoutes.js');
const { default: vendorRoutes } = await import('../routes/vendorRoutes.js');
const { default: adminOrders } = await import('../routes/admin/ordersRoutes.js');
const { default: adminRiders } = await import('../routes/admin/ridersRoutes.js');
const { adminProtect } = await import('../middleware/adminAuth.js');
const { signToken } = await import('../utils/jwt.js');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Order } = await import('../models/Order.js');
const { default: RiderEarning } = await import('../models/RiderEarning.js');
await import('../models/Role.js'); // adminProtect populates rbacRole

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/admin/orders', adminProtect, adminOrders);
app.use('/admin/riders', adminProtect, adminRiders);

const OUT = process.env.INVOICE_TEST_OUT && path.resolve(home, process.env.INVOICE_TEST_OUT);
const keep = (name, body) => {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), body);
};
const binary = (res, cb) => {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
};
const get = (url, token) => {
  const r = request(app).get(url).buffer(true).parse(binary);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

let mongo;
let customer;
let other;
let vendor;
let admin;
let rider;
let delivered;
let preparing;
const tok = {};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_invoice_test'));
  const mk = (name, phone, role, extra = {}) => User.create({
    name, email: `${role}${phone}@example.test`, phone, password: 'not-used-anywhere-1A!',
    role, isVerified: true, ...extra,
  });
  customer = await mk('Test Customer', '9222222222', 'user');
  other = await mk('Someone Else', '9222222223', 'user');
  vendor = await mk('Test Vendor', '9211111111', 'vendor');
  admin = await mk('Test Admin', '9200000000', 'admin');
  rider = await mk('Test Rider', '9233333333', 'rider', { riderId: 'RDR-1042', vehicleType: 'bike', city: 'Lucknow' });
  Object.assign(tok, {
    customer: signToken(customer._id),
    other: signToken(other._id),
    vendor: signToken(vendor._id),
    admin: signToken(admin._id),
  });

  await seedTestRestaurant(
    { latitude: 26.91, longitude: 80.942, vendor: '9211111111', customer: '9222222222' },
    { apply: true }
  );
  const restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
  const food = await FoodItem.findOne({ restaurantId: restaurant._id });
  const base = {
    userId: customer._id,
    restaurantId: restaurant._id,
    riderId: rider._id,
    items: [{ foodItemId: food._id, name: 'Chicken biriyani', quantity: 2, price: 100 }],
    subtotal: 200,
    tax: 10,
    platformFee: 8,
    deliveryFee: 30,
    packagingFee: 10,
    discount: 20,
    gstAndPackaging: 10 + 5.4 + 1.44,
    walletUsed: 20,
    paymentMethod: 'cod',
    total: 200 + 10 + 8 + 30 + 10 + 5.4 + 1.44 - 20 - 20,
    deliveryAddress: { street: 'Sitapur Road', city: 'Lucknow', state: 'Uttar Pradesh', zipCode: '226021' },
  };
  delivered = await Order.create({ ...base, status: 'Delivered' });
  preparing = await Order.create({ ...base, status: 'Processing' });
  await RiderEarning.create({
    riderId: rider._id,
    orderId: delivered._id,
    restaurantId: restaurant._id,
    deliveryFee: 30,
    commission: 3,
    incentive: 5,
    totalEarning: 27,
    distance: 3.2,
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  process.chdir(home);
  fs.rmSync(scratch, { recursive: true, force: true });
});

const isPdf = (res, pages) => {
  assert.equal(res.status, 200, String(res.body).slice(0, 300));
  assert.match(res.headers['content-type'], /application\/pdf/);
  const buf = res.body;
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, pages);
};

test('customer downloads the 3-page invoice for a delivered order', async () => {
  const res = await get(`/api/orders/${delivered._id}/invoice`, tok.customer);
  isPdf(res, 3);
  keep('customer-invoice.pdf', res.body);
});

test('customer signed link opens the same PDF without a login header', async () => {
  const link = await request(app)
    .get(`/api/orders/${delivered._id}/invoice-link`)
    .set('Authorization', `Bearer ${tok.customer}`);
  assert.equal(link.status, 200);
  const url = new URL(link.body.data.url);
  isPdf(await get(url.pathname), 3);
  assert.equal((await get('/api/orders/invoice-file/not-a-token')).status, 401);
});

test('an order that is not delivered has no invoice', async () => {
  const res = await request(app)
    .get(`/api/orders/${preparing._id}/invoice`)
    .set('Authorization', `Bearer ${tok.customer}`);
  assert.equal(res.status, 409);
  const link = await request(app)
    .get(`/api/orders/${preparing._id}/invoice-link`)
    .set('Authorization', `Bearer ${tok.customer}`);
  assert.equal(link.status, 409);
});

test('another customer cannot fetch the invoice', async () => {
  const res = await request(app)
    .get(`/api/orders/${delivered._id}/invoice`)
    .set('Authorization', `Bearer ${tok.other}`);
  assert.equal(res.status, 404);
});

test('vendor gets only the restaurant page', async () => {
  const res = await get(`/api/vendor/orders/${delivered._id}/invoice`, tok.vendor);
  isPdf(res, 1);
  keep('vendor-invoice.pdf', res.body);
});

test('admin downloads the full invoice', async () => {
  const res = await get(`/admin/orders/${delivered._id}/invoice`, tok.admin);
  isPdf(res, 3);
});

test('admin generates a rider payout statement for a period', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const res = await get(`/admin/riders/${rider._id}/payout-statement?from=${today}&to=${today}`, tok.admin);
  // The summary page plus one page of order lines.
  isPdf(res, 2);
  keep('rider-statement.pdf', res.body);
  const bad = await get(`/admin/riders/${rider._id}/payout-statement?from=2026-10-30&to=2026-10-01`, tok.admin);
  assert.equal(bad.status, 400);
});
