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

const { seedTestRestaurant, seedTestRestaurants, EXTRA_OUTLETS, TEST_OUTLET_ID } = await import(
  '../scripts/seed-test-restaurant.mjs'
);
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

// Madiyaon, north Lucknow (Sitapur Road), which is where the app is being tried out.
const HERE = { latitude: 26.9100, longitude: 80.9420 };
/** About a kilometre away. */
const CUSTOMER_AT = { latitude: 26.9190, longitude: 80.9420 };

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
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        zipCode: '226001',
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

describe('the three extra kitchens', () => {
  const NAMES = EXTRA_OUTLETS.map((outlet) => outlet.name);
  const everything = (extra = {}) => ({ ...options(), ...extra });
  const extraKitchens = () => Restaurant.find({ outletId: { $in: EXTRA_OUTLETS.map((o) => o.outletId) } });
  const counts = async () => [
    await Restaurant.countDocuments(),
    await FoodItem.countDocuments(),
    await Coupon.countDocuments(),
  ];

  const listing = async (query = '') => {
    const res = await request(app).get(
      `/api/restaurants?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}${query}`
    );
    assert.equal(res.status, 200);
    return res.body.data.restaurants;
  };

  test('a dry run names them and writes nothing', async () => {
    const before = await counts();
    const result = await seedTestRestaurants(everything(), { apply: false });
    assert.deepEqual(result.problems, []);
    for (const name of NAMES) assert.ok(result.actions.some((a) => a.includes(name)), name);
    assert.ok(result.warnings.some((w) => /no owner/.test(w)), 'warns that nobody can confirm their orders');
    assert.deepEqual(await counts(), before);
  });

  test('applying creates all three, approved, open and stocked', async () => {
    const result = await seedTestRestaurants(everything(), { apply: true });
    assert.deepEqual(result.problems, []);
    assert.equal(result.restaurants.length, 4);

    const made = await extraKitchens();
    assert.equal(made.length, 3);
    for (const kitchen of made) {
      assert.equal(kitchen.status, 'approved');
      assert.equal(kitchen.isEnabled, true);
      assert.equal(kitchen.isOpen, true);
      assert.equal(kitchen.address.city, 'Lucknow');
      assert.equal(kitchen.address.zipCode, '226021');
      assert.equal(kitchen.owner, undefined);
      assert.ok((await FoodItem.countDocuments({ restaurantId: kitchen._id })) >= 9, kitchen.name);
    }
  });

  test('they sit within a couple of kilometres of the pin', async () => {
    const { distanceKm } = await import('../services/serviceabilityService.js');
    for (const kitchen of await extraKitchens()) {
      const away = distanceKm(HERE, kitchen.address.coordinates);
      assert.ok(away > 0.3 && away < 3, `${kitchen.name} is ${away.toFixed(2)} km away`);
    }
  });

  test('a second run adds nothing and does not duplicate', async () => {
    const before = await counts();
    const result = await seedTestRestaurants(everything(), { apply: true });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(await counts(), before);
  });

  test('all four are on the home screen, and the category filter tells them apart', async () => {
    const list = await listing();
    for (const name of ['Reditoe Test Kitchen', ...NAMES]) {
      const found = list.find((r) => r.name === name);
      assert.ok(found, `${name} listed`);
      assert.equal(found.isOrderable, true, `${name} orderable`);
    }

    const pizza = (await listing('&category=Pizza')).map((r) => r.name);
    assert.ok(pizza.includes('Crust & Co. Pizzeria'));
    assert.ok(!pizza.includes('Chaat Gali'));
    const chaat = (await listing('&category=Chaat')).map((r) => r.name);
    assert.ok(chaat.includes('Chaat Gali'));
    assert.ok(!chaat.includes('Crust & Co. Pizzeria'));
  });

  test('the menu of an extra kitchen has sizes and extras the app can draw', async () => {
    const pizzeria = await Restaurant.findOne({ outletId: 'RES-TESTCRUST' });
    const res = await request(app).get(
      `/api/restaurants/${pizzeria._id}/menu?lat=${CUSTOMER_AT.latitude}&lng=${CUSTOMER_AT.longitude}`
    );
    assert.equal(res.status, 200);
    const flat = JSON.stringify(res.body);
    assert.match(flat, /Margherita Pizza/);
    assert.match(flat, /Medium \(10\\"\)/);
    assert.match(flat, /Extra cheese/);
  });

  const orderAt = async (outletId, dishNames, extra = {}) => {
    const kitchen = await Restaurant.findOne({ outletId });
    const dishes = await FoodItem.find({ restaurantId: kitchen._id, name: { $in: dishNames } });
    return {
      restaurantId: String(kitchen._id),
      items: dishes.map((dish) => ({ foodItemId: String(dish._id), quantity: 1 })),
      deliveryAddress: {
        street: '1 Test Road', city: 'Lucknow', state: 'Uttar Pradesh', zipCode: '226021',
        coordinates: CUSTOMER_AT,
      },
      ...extra,
    };
  };

  test('TEST20 comes off a basket at an extra kitchen', async () => {
    const body = await orderAt('RES-TESTCRUST', ['White Sauce Pasta', 'Garlic Bread with Cheese'], {
      couponCode: 'TEST20',
    });
    const res = await request(app)
      .post('/api/orders/pricing-preview')
      .set('x-user-id', String(customer._id))
      .send(body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.couponError, null);
    // 189 + 129 = 318; 20% is 63.60, taken in whole rupees.
    assert.equal(res.body.data.discount, 64);
    assert.equal(res.body.data.packagingFee, 15);
  });

  test('a cash order can be placed at a kitchen that has no owner yet', async () => {
    const body = await orderAt('RES-TESTCHAAT', ['Basket Chaat', 'Masala Chai']);
    const res = await request(app)
      .post('/api/orders/create')
      .set('x-user-id', String(customer._id))
      .send({ ...body, paymentMethod: 'cod' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const placed = await Order.findOne({ restaurantId: body.restaurantId });
    assert.equal(placed.status, 'Waiting for Confirmation');
  });

  describe('vendors', () => {
    const phones = ['9255555551', '9255555552', '9255555553'];

    before(async () => {
      for (const [index, phone] of phones.entries()) {
        await User.create({
          name: `Extra Vendor ${index + 1}`,
          email: `extra-vendor-${index + 1}@example.test`,
          phone,
          password: 'not-used-anywhere-1A!',
          role: 'vendor',
        });
      }
    });

    test('bad vendor numbers stop the whole run before anything is written', async () => {
      const before = await counts();
      const cases = [
        [['9211111111'], /each kitchen needs its own vendor/], // the main kitchen's vendor
        [['9233333333'], /already owns/], // runs "Real Place" already
        [['9222222222'], /not a vendor/], // a customer
        [['9299999999'], /No account/], // nobody
        [[phones[0], phones[0]], /each kitchen needs its own vendor/],
        [[...phones, '9255555554'], /at most 3/],
      ];
      for (const [vendors, expected] of cases) {
        const result = await seedTestRestaurants(everything({ vendors }), { apply: true });
        assert.match(result.problems.join(' '), expected);
      }
      assert.deepEqual(await counts(), before);
    });

    test('--vendors gives each extra kitchen its own owner', async () => {
      const result = await seedTestRestaurants(everything({ vendors: phones }), { apply: true });
      assert.deepEqual(result.problems, []);
      assert.ok(!result.warnings.some((w) => /no owner/.test(w)));

      for (const [index, outlet] of EXTRA_OUTLETS.entries()) {
        const kitchen = await Restaurant.findOne({ outletId: outlet.outletId });
        const vendor = await User.findOne({ phone: phones[index] });
        assert.equal(String(kitchen.owner), String(vendor._id), outlet.name);
      }
    });

    test('a later run without --vendors does not take the owners away', async () => {
      const result = await seedTestRestaurants(everything(), { apply: true });
      assert.deepEqual(result.problems, []);
      assert.ok(!result.warnings.some((w) => /no owner/.test(w)));
      const kitchens = await extraKitchens();
      assert.ok(kitchens.every((kitchen) => kitchen.owner));
    });
  });

  test('both test coupons now apply at every test kitchen', async () => {
    const ids = [
      ...(await extraKitchens()).map((k) => String(k._id)),
      String((await Restaurant.findOne({ outletId: TEST_OUTLET_ID }))._id),
    ];
    for (const code of ['TEST20', 'TESTFLAT50']) {
      const coupon = await Coupon.findOne({ code });
      const applies = coupon.applicableRestaurants.map(String);
      for (const id of ids) assert.ok(applies.includes(id), `${code} at ${id}`);
    }
  });

  test('--no-extras seeds only the main kitchen', async () => {
    const result = await seedTestRestaurants(everything({ extras: false }), { apply: false });
    assert.deepEqual(result.problems, []);
    for (const name of NAMES) assert.ok(!result.actions.some((a) => a.includes(name)), name);
  });
});
