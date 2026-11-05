/**
 * Cancelling, rejecting and handing over an order.
 *
 *     node --test tests/order-actions.test.mjs
 *
 * Customer cancellation (and that it cannot be abused to set another status),
 * the restaurant rejecting an order with a reason, the restaurant details the
 * customer sees on an order, and the vendor "Pickup Done" handover.
 *
 * Runs against an in-memory database; nothing real is touched.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
process.env.SMS_PROVIDER = 'msg91';
process.env.MSG91_AUTH_KEY = 'test-key';
process.env.MSG91_TEMPLATE_ID = 'tpl-default';
process.env.MSG91_TEMPLATE_ID_VENDOR = 'tpl-vendor';
process.env.MSG91_TEMPLATE_ID_RIDER = 'tpl-rider';
// The Razorpay client is built when its controller loads; these never reach it.
process.env.RAZORPAY_KEY_ID = 'rzp_test_not_a_real_key';
process.env.RAZORPAY_KEY_SECRET = 'not-a-real-secret';
delete process.env.ALLOW_DEBUG_OTP;
delete process.env.MONGODB_URI;
delete process.env.GOOGLE_MAPS_API_KEY;

// multer writes uploads under the working directory; keep them out of the repo.
const home = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-actions-test-'));
process.chdir(scratch);

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: axios } = await import('axios');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { seedTestRestaurant, TEST_OUTLET_ID } = await import('../scripts/seed-test-restaurant.mjs');
const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: restaurantRoutes } = await import('../routes/restaurantRoutes.js');
const { default: orderRoutes } = await import('../routes/orderRoutes.js');
const { default: vendorRoutes } = await import('../routes/vendorRoutes.js');
const { default: riderRoutes } = await import('../routes/riderRoutes.js');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Order } = await import('../models/Order.js');

/** Every SMS the provider was asked to carry. */
let sms = [];
axios.post = async (url, body) => {
  sms.push({ url, ...body.recipients[0], template: body.template_id });
  return { data: { type: 'success' } };
};

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/rider', riderRoutes);

// Madiyaon, north Lucknow (Sitapur Road), which is where the app is being tried out.
const HERE = { latitude: 26.9100, longitude: 80.9420 };
/** About a kilometre from the restaurant. */
const CUSTOMER_AT = { latitude: 26.9190, longitude: 80.9420 };

const PHONES = { customer: '9222222222', vendor: '9211111111', rider: '9233333333' };

let mongo;
const tokens = {};
const bearer = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
let restaurantId;
let order;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_actions_test'));

  // The accounts the real apps would already have created at sign-up.
  await User.create({
    name: 'Test Customer', email: 'customer@example.test', phone: PHONES.customer,
    password: 'not-used-anywhere-1A!', role: 'user', isVerified: true,
  });
  await User.create({
    name: 'Test Vendor', email: 'vendor@example.test', phone: PHONES.vendor,
    password: 'not-used-anywhere-1A!', role: 'vendor', isVerified: true,
  });
  await User.create({
    name: 'Test Rider', email: 'rider@example.test', phone: PHONES.rider,
    password: 'not-used-anywhere-1A!', role: 'rider', isVerified: true, status: 'active',
    isOnline: true,
    currentLocation: { type: 'Point', coordinates: [HERE.longitude, HERE.latitude] },
  });

  const seeded = await seedTestRestaurant(
    {
      latitude: HERE.latitude,
      longitude: HERE.longitude,
      vendor: PHONES.vendor,
      customer: PHONES.customer,
    },
    { apply: true }
  );
  assert.deepEqual(seeded.problems, []);
  restaurantId = String((await Restaurant.findOne({ outletId: TEST_OUTLET_ID }))._id);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  process.chdir(home);
  fs.rmSync(scratch, { recursive: true, force: true });
});

const signIn = async (who, role) => {
  const phone = PHONES[who];
  const asked = await request(app).post('/api/auth/send-otp').send({ phone, role });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const code = sms.at(-1)[process.env.MSG91_OTP_VAR || 'num'];
  const verified = await request(app).post('/api/auth/verify-otp').send({ phone, otp: code, role });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.isNewUser, false, `${who} should be recognised, not sent to sign-up`);
  assert.ok(verified.body.token);
  tokens[who] = verified.body.token;
  return verified.body;
};

const placeOrder = async () => {
  const biryani = await FoodItem.findOne({ restaurantId, name: 'Chicken Biryani' });
  const res = await request(app)
    .post('/api/orders/create')
    .set(bearer('customer'))
    .send({
      restaurantId,
      items: [{ foodItemId: String(biryani._id), quantity: 1 }],
      deliveryAddress: {
        street: '1 Test Road', city: 'Lucknow', state: 'Uttar Pradesh', zipCode: '226001',
        coordinates: CUSTOMER_AT,
      },
      paymentMethod: 'cod',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return Order.findOne({ restaurantId }).sort({ createdAt: -1 });
};

const vendorMove = (id, status, extra = {}) =>
  request(app).patch(`/api/vendor/orders/${id}/status`).set(bearer('vendor')).send({ status, ...extra });

describe('sign in', () => {
  test('everyone', async () => {
    await signIn('customer', 'user');
    await signIn('vendor', 'vendor');
    await signIn('rider', 'rider');
  });
});

describe('the customer cancels', () => {
  test('the order shows who is cooking it: name, address and phone', async () => {
    const placed = await placeOrder();
    const mine = await request(app).get('/api/orders/my-orders').set(bearer('customer'));
    const row = mine.body.data.orders.find((o) => String(o.id) === String(placed._id));
    assert.ok(row, 'listed');
    assert.equal(row.restaurantId.name, 'Reditoe Test Kitchen');
    assert.equal(row.restaurantId.address.city, 'Lucknow');
    assert.ok('phone' in row.restaurantId || row.restaurantId.phone === undefined);
    assert.equal(row.canCancel, true);
  });

  test('a waiting order can be cancelled, with the reason kept', async () => {
    const placed = await Order.findOne({ restaurantId }).sort({ createdAt: -1 });
    const res = await request(app)
      .patch(`/api/orders/${placed._id}/status`)
      .set(bearer('customer'))
      .send({ reason: 'Ordered by mistake' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = await Order.findById(placed._id);
    assert.equal(fresh.status, 'Cancelled');
    assert.equal(fresh.cancellationReason, 'Ordered by mistake');
    assert.ok(fresh.cancelledBy);
  });

  test('a cancelled order cannot be cancelled again', async () => {
    const placed = await Order.findOne({ restaurantId }).sort({ createdAt: -1 });
    const res = await request(app)
      .patch(`/api/orders/${placed._id}/status`)
      .set(bearer('customer'))
      .send({ reason: 'again' });
    assert.equal(res.status, 400);
  });

  test('the request cannot be used to set some other status', async () => {
    const placed = await placeOrder();
    const res = await request(app)
      .patch(`/api/orders/${placed._id}/status`)
      .set(bearer('customer'))
      .send({ status: 'Delivered', reason: 'sneaky' });
    assert.equal(res.status, 200);
    assert.equal((await Order.findById(placed._id)).status, 'Cancelled');
  });

  test('once the restaurant has accepted, it is too late', async () => {
    const placed = await placeOrder();
    assert.equal((await vendorMove(placed._id, 'Order Confirmed')).status, 200);
    const res = await request(app)
      .patch(`/api/orders/${placed._id}/status`)
      .set(bearer('customer'))
      .send({ reason: 'changed my mind' });
    assert.equal(res.status, 400);
    assert.equal((await Order.findById(placed._id)).status, 'Order Confirmed');
  });

  test('somebody else’s order cannot be cancelled', async () => {
    const placed = await placeOrder();
    const res = await request(app)
      .patch(`/api/orders/${placed._id}/status`)
      .set(bearer('vendor'))
      .send({ reason: 'not mine' });
    assert.equal(res.status, 403);
  });
});

describe('the restaurant rejects', () => {
  test('a new order is rejected with a reason the customer can see', async () => {
    const placed = await placeOrder();
    const res = await vendorMove(placed._id, 'Cancelled', { reason: 'Item unavailable' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = await Order.findById(placed._id);
    assert.equal(fresh.status, 'Cancelled');
    assert.equal(fresh.cancellationReason, 'Item unavailable');
    assert.ok(fresh.timeline.at(-1).message.includes('Item unavailable'));
  });

  test('without a reason it still records one', async () => {
    const placed = await placeOrder();
    assert.equal((await vendorMove(placed._id, 'Cancelled')).status, 200);
    assert.equal((await Order.findById(placed._id)).cancellationReason, 'Rejected by the restaurant');
  });
});

describe('Pickup Done', () => {
  let ready;

  const pickupDone = (id, who = 'vendor') =>
    request(app).post(`/api/vendor/orders/${id}/pickup-done`).set(bearer(who));

  test('an order that is not ready cannot be marked picked up', async () => {
    ready = await placeOrder();
    const res = await pickupDone(ready._id);
    assert.equal(res.status, 409);
  });

  test('a ready order with nobody carrying it cannot be marked picked up', async () => {
    for (const next of ['Order Confirmed', 'Processing', 'Ready']) {
      assert.equal((await vendorMove(ready._id, next)).status, 200);
    }
    const res = await pickupDone(ready._id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /delivery partner/i);
  });

  test('once the rider has accepted, Pickup Done sends it out for delivery', async () => {
    const accepted = await request(app).patch(`/api/rider/orders/${ready._id}/accept`).set(bearer('rider'));
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const res = await pickupDone(ready._id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = await Order.findById(ready._id);
    assert.equal(fresh.status, 'OnWay');
    assert.ok(fresh.pickupVerification.verifiedAt);
    assert.equal(fresh.pickupVerification.method, 'vendor');
  });

  test('the customer now sees the delivery code, and tapping twice is harmless', async () => {
    const code = await request(app).get(`/api/orders/${ready._id}/delivery-code`).set(bearer('customer'));
    assert.equal(code.body.data.available, true);
    const again = await pickupDone(ready._id);
    assert.equal(again.status, 200);
    assert.equal((await Order.findById(ready._id)).status, 'OnWay');
  });

  test('the rider can carry on and finish the delivery', async () => {
    const code = await request(app).get(`/api/orders/${ready._id}/delivery-code`).set(bearer('customer'));
    const done = await request(app)
      .patch(`/api/rider/orders/${ready._id}/delivery-verify`)
      .set(bearer('rider'))
      .send({ code: code.body.data.code });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await Order.findById(ready._id)).status, 'Delivered');
  });

  test('a customer cannot use it', async () => {
    const res = await pickupDone(ready._id, 'customer');
    assert.equal(res.status, 403);
  });
});
