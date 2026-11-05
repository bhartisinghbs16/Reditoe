/**
 * The statement demo-order seed, against an in-memory database:
 *
 *     node --test tests/seed-statement-demo-order.test.mjs
 *
 * Dry run changes nothing, --apply adds one Delivered order that the vendor's
 * statement picks up, and --remove takes back exactly that order.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
delete process.env.MONGODB_URI;

const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { seedTestRestaurant } = await import('../scripts/seed-test-restaurant.mjs');
const { seedStatementDemoOrder, DEMO_TAG } = await import('../scripts/seed-statement-demo-order.mjs');
const { default: Order } = await import('../models/Order.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: User } = await import('../models/User.js');

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_demo_order_test'));
  await User.create({
    name: 'Demo Vendor', email: 'vendor9219583594@example.test', phone: '+919219583594',
    password: 'not-used-anywhere-1A!', role: 'vendor', isVerified: true,
  });
  await seedTestRestaurant({ latitude: 26.91, longitude: 80.942, vendor: '9219583594' }, { apply: true });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('dry run writes nothing; apply adds one delivered order; remove takes it back', async () => {
  const restaurant = await Restaurant.findOne({ owner: (await User.findOne({ phone: '+919219583594' }))._id });
  const count = () => Order.countDocuments({ restaurantId: restaurant._id });

  const dry = await seedStatementDemoOrder({ vendor: '9219583594' });
  assert.deepEqual(dry.problems, []);
  assert.equal(await count(), 0);

  const done = await seedStatementDemoOrder({ vendor: '9219583594' }, { apply: true });
  assert.equal(await count(), 1);
  assert.equal(done.order.status, 'Delivered');
  assert.equal(done.order.notes, DEMO_TAG);

  await seedStatementDemoOrder({ vendor: '9219583594', remove: true }, { apply: true });
  assert.equal(await count(), 0);
});

test('refuses an unknown mobile', async () => {
  const res = await seedStatementDemoOrder({ vendor: '9000000000' });
  assert.equal(res.problems.length, 1);
});
