/**
 * The customer's bill, end to end: what the checkout screen is quoted, what the
 * order is created at, and what is stored for the admin console to print.
 *
 * Runs on an in-memory MongoDB, so it touches nothing outside this process:
 *
 *     node --test tests/order-billing.test.mjs
 *
 * The rule under test is one sentence: the preview and the created order never
 * disagree, and every line of the bill adds up to its total.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
delete process.env.MONGODB_URI;
delete process.env.GOOGLE_MAPS_API_KEY;

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { previewOrderPricing, createOrder } = await import('../controllers/user/orderController.js');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Coupon } = await import('../models/Coupon.js');
const { default: Wallet } = await import('../models/Wallet.js');
const { default: Order } = await import('../models/Order.js');
const { default: Settings } = await import('../models/Settings.js');

// Stands in for `protect`: whoever the header names is signed in.
const asUser = async (req, _res, next) => {
  req.user = await User.findById(req.headers['x-user-id']);
  next();
};

const app = express();
app.use(express.json());
app.post('/api/orders/pricing-preview', asUser, previewOrderPricing);
app.post('/api/orders/create', asUser, createOrder);

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_billing_test'));
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

let user;
let restaurant;
let dish;

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    FoodItem.deleteMany({}),
    Coupon.deleteMany({}),
    Wallet.deleteMany({}),
    Order.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  user = await User.create({
    name: 'Test Customer',
    email: 'customer@example.test',
    phone: '9876543210',
    password: 'not-used-anywhere-1A!',
  });
  restaurant = await Restaurant.create({
    name: 'Billing Kitchen',
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    dailyPackagingFee: 12,
    // A kitchen that has set its location, so the order's serviceability check passes.
    address: { coordinates: { latitude: 13.6288, longitude: 79.4192 } },
  });
  dish = await FoodItem.create({
    name: 'Biryani',
    price: 200,
    restaurantId: restaurant._id,
    isAvailable: true,
  });
});

const payload = (extra = {}) => ({
  restaurantId: String(restaurant._id),
  items: [{ foodItemId: String(dish._id), quantity: 1 }],
  deliveryAddress: {
    street: '1 Test Road',
    city: 'Tirupati',
    state: 'AP',
    zipCode: '517501',
    // About a kilometre from the kitchen: inside the base-fee distance.
    coordinates: { latitude: 13.6348, longitude: 79.4192 },
  },
  ...extra,
});

const preview = (extra) =>
  request(app).post('/api/orders/pricing-preview').set('x-user-id', String(user._id)).send(payload(extra));

const create = (extra) =>
  request(app)
    .post('/api/orders/create')
    .set('x-user-id', String(user._id))
    .send(payload({ paymentMethod: 'razorpay', ...extra }));

const coupon = (fields) =>
  Coupon.create({
    name: 'Test coupon',
    createdBy: user._id,
    isPublic: true,
    isActive: true,
    isGlobal: true,
    endDate: new Date(Date.now() + 86_400_000),
    ...fields,
  });

const paise = (n) => Math.round(n * 100);

/** The identity every bill must satisfy, to the paisa. */
const assertAddsUp = (o) => {
  const lines =
    paise(o.subtotal) +
    paise(o.packagingFee ?? 0) +
    paise(o.deliveryFee) +
    paise(o.platformFee) +
    paise(o.gstAndPackaging) +
    paise(o.tip ?? 0) -
    paise(o.discount ?? 0) -
    paise(o.walletUsed ?? 0);
  assert.equal(lines, paise(o.total), `lines add to ${lines / 100}, total says ${o.total}`);
};

/** What the preview calls a field is not always what the order calls it. */
const asOrderShape = (d) => ({
  subtotal: d.subtotal,
  packagingFee: d.packagingFee,
  deliveryFee: d.deliveryFee,
  platformFee: d.platformFee,
  gstAndPackaging: d.totalGST,
  tip: d.tip,
  discount: d.discount,
  walletUsed: d.walletUsed,
  total: d.finalTotal,
});

describe('bill without a coupon', () => {
  test('preview lines add up and nothing is deducted', async () => {
    const res = await preview();
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.discount, 0);
    assert.equal(d.walletUsed, 0);
    assert.equal(d.finalTotal, d.grossTotal);
    assertAddsUp(asOrderShape(d));
  });

  test('the order is created at exactly the previewed total', async () => {
    const quoted = (await preview()).body.data;
    const res = await create();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const placed = res.body.data.order;
    assert.equal(placed.total, quoted.finalTotal);
    assert.equal(placed.deliveryFee, quoted.deliveryFee);
    assert.equal(placed.platformFee, quoted.platformFee);
    assert.equal(placed.gstAndPackaging, quoted.totalGST);
    assert.equal(placed.packagingFee, quoted.packagingFee);
    assertAddsUp(placed);
  });
});

describe('coupon discount', () => {
  test('a percentage coupon is taken off the item total, not the taxes and fees', async () => {
    await coupon({ code: 'TEN', type: 'percentage', discountValue: 10 });
    const d = (await preview({ couponCode: 'TEN' })).body.data;
    // 10% of 200, not of the 266.84 the customer would otherwise owe.
    assert.equal(d.discount, 20);
    assert.equal(d.couponCode, 'TEN');
    assert.equal(d.finalTotal, Number((d.grossTotal - 20).toFixed(2)));
    assertAddsUp(asOrderShape(d));
  });

  test('a flat coupon, a cap on a percentage, and the amount charged all agree', async () => {
    await coupon({ code: 'CAPPED', type: 'percentage', discountValue: 50, maxDiscount: 30 });
    const quoted = (await preview({ couponCode: 'CAPPED' })).body.data;
    assert.equal(quoted.discount, 30);

    const res = await create({ couponCode: 'CAPPED' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const placed = res.body.data.order;
    assert.equal(placed.discount, 30);
    assert.equal(placed.couponCode, 'CAPPED');
    assert.equal(placed.total, quoted.finalTotal);
    assertAddsUp(placed);

    const stored = await Order.findById(placed.id);
    assert.equal(stored.discount, 30);
    assert.equal(stored.total, quoted.finalTotal);
  });

  test('the minimum order is measured on the item total', async () => {
    // 200 of food carrying 66.84 of charges: a bill of 266.84 must not satisfy
    // a minimum order of 250.
    await coupon({ code: 'BIG', type: 'flat', discountValue: 50, minOrderValue: 250 });

    const quoted = await preview({ couponCode: 'BIG' });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.data.discount, 0);
    assert.equal(quoted.body.data.couponError.code, 'COUPON_MIN_ORDER_NOT_MET');
    assert.equal(quoted.body.data.finalTotal, quoted.body.data.grossTotal);

    const refused = await create({ couponCode: 'BIG' });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, 'COUPON_MIN_ORDER_NOT_MET');
  });

  test('an unknown code prices the basket in a preview and refuses the order', async () => {
    const quoted = await preview({ couponCode: 'NOPE' });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.data.discount, 0);
    assert.equal(quoted.body.data.couponError.code, 'INVALID_COUPON');

    const refused = await create({ couponCode: 'NOPE' });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.code, 'INVALID_COUPON');
  });
});

describe('Reditoe Money', () => {
  beforeEach(async () => {
    await Wallet.create({ userId: user._id, balance: 500 });
    user.walletBalance = 500;
    await user.save({ validateBeforeSave: false });
  });

  test('is capped against what is still owed after the coupon', async () => {
    await coupon({ code: 'TEN', type: 'percentage', discountValue: 10 });
    const d = (await preview({ couponCode: 'TEN', useWallet: true })).body.data;
    // Ten percent of (gross - 20), rounded down to whole rupees.
    const expected = Math.floor((d.grossTotal - d.discount) * 0.1);
    assert.equal(d.walletUsed, expected);
    assert.ok(d.walletUsed > 0);
    assertAddsUp(asOrderShape(d));
  });

  test('is only deducted when asked for', async () => {
    const d = (await preview({ useWallet: false })).body.data;
    assert.equal(d.walletUsed, 0);
    assert.equal(d.finalTotal, d.grossTotal);
    // Offered, though not taken: the checkout screen shows this as the most it could cover.
    assert.equal(d.walletCap, Math.floor(d.grossTotal * 0.1));
  });

  test('the order, the wallet and the preview all take the same amount', async () => {
    await coupon({ code: 'TEN', type: 'percentage', discountValue: 10 });
    const quoted = (await preview({ couponCode: 'TEN', useWallet: true })).body.data;

    const res = await create({ couponCode: 'TEN', useWallet: true });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const placed = res.body.data.order;
    assert.equal(placed.walletUsed, quoted.walletUsed);
    assert.equal(placed.discount, quoted.discount);
    assert.equal(placed.total, quoted.finalTotal);
    assertAddsUp(placed);

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet.balance, 500 - quoted.walletUsed);
  });

  test('a frozen wallet contributes nothing', async () => {
    await Wallet.updateOne({ userId: user._id }, { isFrozen: true });
    const d = (await preview({ useWallet: true })).body.data;
    assert.equal(d.walletUsed, 0);
  });
});

describe('what a client cannot do to the bill', () => {
  test('a negative tip does not become a discount', async () => {
    const d = (await preview({ tip: -500 })).body.data;
    assert.equal(d.tip, 0);
    assert.equal(d.finalTotal, d.grossTotal);
  });

  test('a tip is added to the bill and shown as its own line', async () => {
    const without = (await preview()).body.data;
    const d = (await preview({ tip: 20 })).body.data;
    assert.equal(d.tip, 20);
    assert.equal(paise(d.finalTotal), paise(without.finalTotal) + 2000);
    assertAddsUp(asOrderShape(d));
  });
});
