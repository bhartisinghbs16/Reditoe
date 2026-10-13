/**
 * The whole order, start to finish, through the same routes the three apps use.
 *
 *     node --test tests/order-lifecycle.test.mjs
 *
 * 1. scripts/seed-test-restaurant.mjs seeds the Test Kitchen (in-memory DB).
 * 2. The customer, vendor and delivery partner each sign in with a mobile
 *    number and the SMS code, exactly as the apps do.
 * 3. The customer finds the restaurant, opens the menu, gets a quote with a
 *    coupon and places a cash order.
 * 4. The vendor confirms it, prepares it and marks it ready.
 * 5. The delivery partner is offered it, accepts, proves the pickup code, the
 *    customer reads out the delivery code, the rider proves it and collects cash.
 * 6. Every side sees the finished order in its own list.
 *
 * Nothing here reaches a real database or sends a real SMS.
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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-lifecycle-test-'));
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
  await mongoose.connect(mongo.getUri('reditoe_lifecycle_test'));

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

describe('1. everybody signs in with their number and an SMS code', () => {
  test('customer', async () => {
    const body = await signIn('customer', 'user');
    assert.equal(body.data.user.name, 'Test Customer');
  });
  test('vendor', async () => {
    const body = await signIn('vendor', 'vendor');
    assert.equal(body.data.user.role, 'vendor');
  });
  test('delivery partner', async () => {
    const body = await signIn('rider', 'rider');
    assert.equal(body.data.user.role, 'rider');
  });
});

describe('2. the customer finds food', () => {
  test('the test kitchen is on the home screen and orderable', async () => {
    const res = await request(app)
      .get(`/api/restaurants?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}`)
      .set(bearer('customer'));
    assert.equal(res.status, 200);
    const mine = res.body.data.restaurants.find((r) => r.name === 'Reditoe Test Kitchen');
    assert.ok(mine, 'listed');
    assert.equal(mine.isOrderable, true);
    assert.equal(String(mine._id), restaurantId);
    assert.equal(mine.address.city, 'Lucknow');
  });

  test('it is a Lucknow restaurant: not offered to someone standing in Tirupati', async () => {
    const res = await request(app).get('/api/restaurants?lat=13.6288&lng=79.4192').set(bearer('customer'));
    assert.equal(res.status, 200);
    assert.ok(!res.body.data.restaurants.some((r) => r.name === 'Reditoe Test Kitchen'));
  });

  test('it is still offered from the next neighbourhood (Aliganj, about 2.4 km away)', async () => {
    const res = await request(app).get('/api/restaurants?lat=26.9191&lng=80.9644').set(bearer('customer'));
    const mine = res.body.data.restaurants.find((r) => r.name === 'Reditoe Test Kitchen');
    assert.ok(mine, 'listed');
    assert.equal(mine.isOrderable, true);
  });

  test('it is not offered beyond its 8 km radius (Charbagh, about 9 km away)', async () => {
    const res = await request(app).get('/api/restaurants?lat=26.8315&lng=80.9235').set(bearer('customer'));
    assert.equal(res.status, 200);
    assert.ok(!res.body.data.restaurants.some((r) => r.name === 'Reditoe Test Kitchen'));
  });

  test('its menu has the dishes, portions and extras the app draws', async () => {
    const res = await request(app)
      .get(`/api/restaurants/${restaurantId}/menu?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}`)
      .set(bearer('customer'));
    assert.equal(res.status, 200);
    const flat = JSON.stringify(res.body);
    assert.match(flat, /Chicken Biryani/);
    assert.match(flat, /Masala Dosa/);
    assert.doesNotMatch(flat, /Mutton Rogan Josh/, 'a switched-off dish must not be offered');
    assert.match(flat, /Portion/);
    assert.match(flat, /Extra raita/);
  });
});

describe('3. the customer orders', () => {
  const payload = async (extra = {}) => {
    const biryani = await FoodItem.findOne({ restaurantId, name: 'Chicken Biryani' });
    const naan = await FoodItem.findOne({ restaurantId, name: 'Butter Naan' });
    return {
      restaurantId,
      items: [
        { foodItemId: String(biryani._id), quantity: 1 },
        { foodItemId: String(naan._id), quantity: 2 },
      ],
      deliveryAddress: {
        street: '1 Test Road', city: 'Lucknow', state: 'Uttar Pradesh', zipCode: '226001',
        coordinates: CUSTOMER_AT,
      },
      couponCode: 'TEST20',
      ...extra,
    };
  };

  test('the quote carries delivery, packaging and the coupon', async () => {
    const res = await request(app)
      .post('/api/orders/pricing-preview')
      .set(bearer('customer'))
      .send(await payload());
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.couponError, null);
    assert.ok(d.discount > 0, 'TEST20 should discount a Rs 339 basket');
    assert.equal(d.packagingFee, 15);
    assert.ok(d.finalTotal > 0);
  });

  test('a cash order is placed and the customer sees it', async () => {
    const body = await payload();
    const quote = await request(app).post('/api/orders/pricing-preview').set(bearer('customer')).send(body);

    const res = await request(app)
      .post('/api/orders/create')
      .set(bearer('customer'))
      .send({ ...body, paymentMethod: 'cod' });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    order = await Order.findOne({ restaurantId }).sort({ createdAt: -1 });
    assert.equal(order.status, 'Waiting for Confirmation');
    assert.equal(order.paymentMethod, 'cod');
    assert.equal(order.total, quote.body.data.finalTotal, 'charged exactly what was quoted');

    const mine = await request(app).get('/api/orders/my-orders').set(bearer('customer'));
    assert.equal(mine.status, 200);
    assert.ok(JSON.stringify(mine.body).includes(String(order._id)), 'in My Orders');
  });
});

describe('4. the vendor prepares it', () => {
  test('the new order is in the vendor list', async () => {
    const res = await request(app).get('/api/vendor/orders').set(bearer('vendor'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(JSON.stringify(res.body).includes(String(order._id)));
  });

  for (const next of ['Order Confirmed', 'Processing', 'Ready']) {
    test(`moves it to ${next}`, async () => {
      const res = await request(app)
        .patch(`/api/vendor/orders/${order._id}/status`)
        .set(bearer('vendor'))
        .send({ status: next });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.order.status, next);
    });
  }

  test('the vendor cannot skip ahead and close it themselves', async () => {
    const res = await request(app)
      .patch(`/api/vendor/orders/${order._id}/status`)
      .set(bearer('vendor'))
      .send({ status: 'Delivered' });
    assert.equal(res.status, 403);
  });
});

describe('5. the delivery partner brings it', () => {
  test('the order was offered to the online rider', async () => {
    const fresh = await Order.findById(order._id);
    assert.equal(fresh.dispatchState, 'pending');
    assert.equal(fresh.candidateRiderIds.length, 1);
  });

  test('it shows in the rider’s available list', async () => {
    const res = await request(app).get('/api/rider/orders/available').set(bearer('rider'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(JSON.stringify(res.body).includes(String(order._id)));
  });

  test('accepting claims it, but the food is still at the counter', async () => {
    const res = await request(app).patch(`/api/rider/orders/${order._id}/accept`).set(bearer('rider'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await Order.findById(order._id)).status, 'Ready');
  });

  test('a wrong pickup code is refused', async () => {
    const res = await request(app)
      .patch(`/api/rider/orders/${order._id}/pickup-verify`)
      .set(bearer('rider'))
      .send({ code: '0000' });
    assert.equal(res.status, 400);
  });

  test('the vendor shows the pickup code and the rider proves it: out for delivery', async () => {
    const shown = await request(app).get(`/api/vendor/orders/${order._id}/pickup-code`).set(bearer('vendor'));
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const res = await request(app)
      .patch(`/api/rider/orders/${order._id}/pickup-verify`)
      .set(bearer('rider'))
      .send({ code: shown.body.data.code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await Order.findById(order._id)).status, 'OnWay');
  });

  test('the customer can track it and now sees the delivery code', async () => {
    const tracking = await request(app).get(`/api/orders/${order._id}/tracking`).set(bearer('customer'));
    assert.equal(tracking.status, 200, JSON.stringify(tracking.body));
    const code = await request(app).get(`/api/orders/${order._id}/delivery-code`).set(bearer('customer'));
    assert.equal(code.status, 200);
    assert.equal(code.body.data.available, true);
    assert.match(code.body.data.code, /^\d{4}$/);
  });

  test('delivery is proved with the customer’s code, and the cash is collected', async () => {
    const code = await request(app).get(`/api/orders/${order._id}/delivery-code`).set(bearer('customer'));
    const done = await request(app)
      .patch(`/api/rider/orders/${order._id}/delivery-verify`)
      .set(bearer('rider'))
      .send({ code: code.body.data.code });
    assert.equal(done.status, 200, JSON.stringify(done.body));

    const cash = await request(app).patch(`/api/rider/orders/${order._id}/confirm-cod`).set(bearer('rider'));
    assert.equal(cash.status, 200, JSON.stringify(cash.body));

    const final = await Order.findById(order._id);
    assert.equal(final.status, 'Delivered');
    assert.equal(final.paymentStatus, 'paid');
    // The time is kept on the timeline. (handoverController also sets
    // `deliveredAt`, but the Order schema has no such field, so Mongoose drops it.)
    assert.ok(final.timeline.some((entry) => entry.status === 'Delivered' && entry.timestamp));
  });
});

describe('6. everybody sees the finished order', () => {
  test('customer history, vendor list and rider history all say Delivered', async () => {
    const mine = await request(app).get('/api/orders/my-orders').set(bearer('customer'));
    const theirs = await request(app).get('/api/vendor/orders').set(bearer('vendor'));
    const rides = await request(app).get('/api/rider/orders').set(bearer('rider'));
    for (const res of [mine, theirs, rides]) {
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(JSON.stringify(res.body).includes(String(order._id)));
      assert.match(JSON.stringify(res.body), /Delivered/);
    }
  });
});
