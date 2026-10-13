/**
 * scripts/seed-test-restaurant.mjs, run against an in-memory MongoDB.
 *
 *     node --test tests/seed-test-restaurant.test.mjs
 *
 * The point is that what it writes is genuinely orderable: the restaurant shows
 * up in the customer listing and its menu, the bill is quoted with a coupon
 * discount, and a cash order can be placed - through the same controllers the
 * app talks to. It never touches a real database.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
delete process.env.MONGODB_URI;
delete process.env.GOOGLE_MAPS_API_KEY;

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { seedTestRestaurant, TEST_OUTLET_ID } = await import('../scripts/seed-test-restaurant.mjs');
const { getRestaurants, getRestaurantMenu } = await import('../controllers/user/restaurantController.js');
const { previewOrderPricing, createOrder } = await import('../controllers/user/orderController.js');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Coupon } = await import('../models/Coupon.js');
const { default: Order } = await import('../models/Order.js');

const asUser = async (req, _res, next) => {
  req.user = await User.findById(req.headers['x-user-id']);
  next();
};

const app = express();
app.use(express.json());
app.get('/api/restaurants', getRestaurants);
app.get('/api/restaurants/:id/menu', getRestaurantMenu);
app.post('/api/orders/pricing-preview', asUser, previewOrderPricing);
app.post('/api/orders/create', asUser, createOrder);

const HERE = { latitude: 13.6288, longitude: 79.4192 };
/** About a kilometre away. */
const CUSTOMER_AT = { latitude: 13.6348, longitude: 79.4192 };

let mongo;
let vendor;
let customer;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_seed_test'));
  vendor = await User.create({
    name: 'Test Vendor',
    email: 'vendor@example.test',
    phone: '9211111111',
    password: 'not-used-anywhere-1A!',
    role: 'vendor',
  });
  customer = await User.create({
    name: 'Test Customer',
    email: 'customer@example.test',
    phone: '9222222222',
    password: 'not-used-anywhere-1A!',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const options = () => ({
  latitude: HERE.latitude,
  longitude: HERE.longitude,
  vendor: '9211111111',
  customer: '9222222222',
});

describe('dry run', () => {
  test('describes the changes and writes nothing', async () => {
    const result = await seedTestRestaurant(options(), { apply: false });

    assert.equal(result.problems.length, 0);
    assert.ok(result.actions.some((a) => a.startsWith('create restaurant')));
    assert.equal(await Restaurant.countDocuments(), 0);
    assert.equal(await FoodItem.countDocuments(), 0);
    assert.equal(await Coupon.countDocuments(), 0);
    assert.notEqual((await User.findById(customer._id)).codEnabled, true);
  });

  test('refuses without a location', async () => {
    const result = await seedTestRestaurant({ vendor: '9211111111' }, { apply: false });
    assert.equal(result.problems.length, 1);
  });

  test('refuses a number that is not a vendor', async () => {
    const result = await seedTestRestaurant({ ...options(), vendor: '9222222222' }, { apply: false });
    assert.match(result.problems[0], /not a vendor/);
  });
});

describe('applied', () => {
  test('creates the restaurant, menu and coupons', async () => {
    const result = await seedTestRestaurant(options(), { apply: true });
    assert.deepEqual(result.problems, []);

    const restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
    assert.ok(restaurant);
    assert.equal(String(restaurant.owner), String(vendor._id));
    assert.equal(restaurant.status, 'approved');
    assert.equal(restaurant.isEnabled, true);
    assert.equal(restaurant.isOpen, true);

    assert.ok((await FoodItem.countDocuments({ restaurantId: restaurant._id })) >= 10);
    assert.deepEqual((await Coupon.find().distinct('code')).sort(), ['TEST20', 'TESTFLAT50']);
    assert.equal((await User.findById(customer._id)).codEnabled, true);
  });

  test('a second run adds nothing and does not duplicate', async () => {
    const before = [
      await Restaurant.countDocuments(),
      await FoodItem.countDocuments(),
      await Coupon.countDocuments(),
    ];
    const result = await seedTestRestaurant(options(), { apply: true });
    assert.deepEqual(result.problems, []);
    const after = [
      await Restaurant.countDocuments(),
      await FoodItem.countDocuments(),
      await Coupon.countDocuments(),
    ];
    assert.deepEqual(after, before);
  });

  test('a menu edit made since is left alone on a re-run', async () => {
    const restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
    await FoodItem.updateOne({ restaurantId: restaurant._id, name: 'Butter Naan' }, { price: 55 });
    await seedTestRestaurant(options(), { apply: true });
    assert.equal((await FoodItem.findOne({ restaurantId: restaurant._id, name: 'Butter Naan' })).price, 55);
  });

  test('another restaurant owned by the same vendor is refused', async () => {
    const other = await User.create({
      name: 'Other Vendor',
      email: 'other@example.test',
      phone: '9233333333',
      password: 'not-used-anywhere-1A!',
      role: 'vendor',
    });
    await Restaurant.create({ name: 'Real Place', owner: other._id, status: 'approved' });
    const result = await seedTestRestaurant({ ...options(), vendor: '9233333333' }, { apply: true });
    assert.match(result.problems[0], /already owns/);
  });
});

describe('what the customer app sees', () => {
  test('the restaurant is listed and orderable near the pin', async () => {
    const res = await request(app).get(`/api/restaurants?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}`);
    assert.equal(res.status, 200);
    const list = res.body.data?.restaurants ?? res.body.data ?? res.body.restaurants;
    const mine = list.find((r) => r.name === 'Reditoe Test Kitchen');
    assert.ok(mine, 'listed');
    assert.equal(mine.isOrderable, true);
  });

  test('it is not offered from another city', async () => {
    const res = await request(app).get('/api/restaurants?lat=28.6139&lng=77.209');
    const list = res.body.data?.restaurants ?? res.body.data ?? res.body.restaurants;
    assert.ok(!list.some((r) => r.name === 'Reditoe Test Kitchen'));
  });

  test('the menu has food, and leaves out the dish that is switched off', async () => {
    const restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
    const res = await request(app).get(
      `/api/restaurants/${restaurant._id}/menu?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}`
    );
    assert.equal(res.status, 200);
    const flat = JSON.stringify(res.body);
    assert.match(flat, /Chicken Biryani/);
    assert.doesNotMatch(flat, /Mutton Rogan Josh/);
  });

  const payload = async (extra = {}) => {
    const restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
    const dish = await FoodItem.findOne({ restaurantId: restaurant._id, name: 'Paneer Butter Masala' });
    return {
      restaurantId: String(restaurant._id),
      items: [{ foodItemId: String(dish._id), quantity: 1 }],
      deliveryAddress: {
        street: '1 Test Road',
        city: 'Tirupati',
        state: 'Andhra Pradesh',
        zipCode: '517501',
        coordinates: CUSTOMER_AT,
      },
      ...extra,
    };
  };

  test('the bill carries the packaging fee, and TEST20 comes off the item total', async () => {
    const res = await request(app)
      .post('/api/orders/pricing-preview')
      .set('x-user-id', String(customer._id))
      .send(await payload({ couponCode: 'TEST20' }));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.packagingFee, 15);
    // 219 of food clears the 199 minimum; 20% is 43.80 and is taken in whole rupees.
    assert.equal(d.discount, 44);
    assert.equal(d.couponError, null);
    assert.equal(d.finalTotal, Math.round((d.grossTotal - d.discount) * 100) / 100);
  });

  test('a cash order is placed for exactly the quoted amount', async () => {
    const body = await payload({ couponCode: 'TEST20' });
    const quote = await request(app)
      .post('/api/orders/pricing-preview')
      .set('x-user-id', String(customer._id))
      .send(body);

    const res = await request(app)
      .post('/api/orders/create')
      .set('x-user-id', String(customer._id))
      .send({ ...body, paymentMethod: 'cod' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const order = await Order.findOne({ userId: customer._id });
    assert.equal(order.total, quote.body.data.finalTotal);
    assert.equal(order.discount, quote.body.data.discount);
    assert.equal(order.status, 'Waiting for Confirmation');
  });
});
