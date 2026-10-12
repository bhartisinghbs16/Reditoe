/**
 * What the customer's tracking feed says as an order is moved along by the
 * vendor, the rider and the delivery check - the same writes those apps make.
 *
 * Runs on an in-memory MongoDB, so it touches nothing outside this process:
 *
 *     node --test tests/order-stage-feed.test.mjs
 *
 * The rule under test is that the customer is told what the order's own status
 * says, the moment it says it: there is no second record of progress for the
 * customer's screen to fall behind.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
delete process.env.MONGODB_URI;
delete process.env.GOOGLE_MAPS_API_KEY;

const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { default: locationTrackingService } = await import('../services/locationTrackingService.js');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Order } = await import('../models/Order.js');

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_stage_feed_test'));
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

let customer;
let rider;
let restaurant;
let order;

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    FoodItem.deleteMany({}),
    Order.deleteMany({}),
  ]);

  customer = await User.create({
    name: 'Test Customer',
    email: 'customer@example.test',
    phone: '9876543210',
    password: 'not-used-anywhere-1A!',
  });
  rider = await User.create({
    name: 'Test Rider',
    email: 'rider@example.test',
    phone: '9876543211',
    password: 'not-used-anywhere-1A!',
  });
  restaurant = await Restaurant.create({
    name: 'Stage Kitchen',
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    address: { coordinates: { latitude: 13.6288, longitude: 79.4192 } },
  });
  const dish = await FoodItem.create({
    name: 'Biryani',
    price: 200,
    restaurantId: restaurant._id,
    isAvailable: true,
  });

  order = await Order.create({
    userId: customer._id,
    restaurantId: restaurant._id,
    items: [{ foodItemId: dish._id, quantity: 1, price: 200, name: 'Biryani' }],
    subtotal: 200,
    tax: 10,
    deliveryFee: 20,
    total: 230,
    timeline: [{ status: 'Waiting for Confirmation', message: 'Order placed' }],
  });
});

const feed = () =>
  locationTrackingService.getOrderTrackingData(String(order._id), String(customer._id));

/** Moves the order the way the vendor, rider and delivery check do. */
const moveTo = async (status, message, extra = {}) => {
  order.status = status;
  order.timeline.push({ status, message, timestamp: new Date() });
  Object.assign(order, extra);
  await order.save({ validateBeforeSave: false });
};

describe('as the vendor works the order', () => {
  test('a new order is preparing, and the feed reports the same status the vendor sees', async () => {
    const data = await feed();
    assert.equal(data.status, 'Waiting for Confirmation');
    assert.equal(data.stage, 'preparing');
  });

  for (const status of ['Order Confirmed', 'Processing', 'Ready']) {
    test(`${status} is preparing`, async () => {
      await moveTo(status, `vendor set ${status}`);
      const data = await feed();
      assert.equal(data.status, status);
      assert.equal(data.stage, 'preparing');
    });
  }
});

describe('as the rider takes it', () => {
  test('a rider who has accepted but not collected it is still preparing', async () => {
    await moveTo('Ready', 'ready');
    // acceptOrder claims the order and leaves the status at Ready.
    order.riderId = rider._id;
    await order.save({ validateBeforeSave: false });

    const data = await feed();
    assert.equal(data.status, 'Ready');
    assert.equal(data.stage, 'preparing');
    assert.equal(data.riderInfo.name, 'Test Rider');
  });

  test('verifying the pickup makes it picked up, with the time it happened', async () => {
    await moveTo('Ready', 'ready', { riderId: rider._id });
    const verifiedAt = new Date();
    await moveTo('OnWay', 'Pickup verified', { pickupVerification: { verifiedAt, method: 'otp' } });

    const data = await feed();
    assert.equal(data.status, 'OnWay');
    assert.equal(data.stage, 'picked_up');
    assert.equal(data.stageTimes.picked_up, verifiedAt.toISOString());
  });

  test('a couple of minutes later, with no position from the rider, it is on the way', async () => {
    await moveTo('Ready', 'ready', { riderId: rider._id });
    const verifiedAt = new Date(Date.now() - 3 * 60_000);
    await moveTo('OnWay', 'Pickup verified', { pickupVerification: { verifiedAt, method: 'otp' } });

    const data = await feed();
    assert.equal(data.stage, 'on_the_way');
  });
});

describe('at the end', () => {
  test('a delivered order is completed, with the time it was delivered', async () => {
    await moveTo('Ready', 'ready', { riderId: rider._id });
    await moveTo('OnWay', 'Pickup verified', {
      pickupVerification: { verifiedAt: new Date(Date.now() - 10 * 60_000), method: 'otp' },
    });
    await moveTo('Delivered', 'Delivery verified');

    const data = await feed();
    assert.equal(data.status, 'Delivered');
    assert.equal(data.stage, 'completed');
    assert.ok(data.stageTimes.completed, 'the delivery time is reported');
    assert.ok(data.stageTimes.picked_up, 'and so is the pickup time');
  });

  test('a cancelled order is cancelled, not filed under a stage', async () => {
    await moveTo('Cancelled', 'vendor cancelled');
    const data = await feed();
    assert.equal(data.status, 'Cancelled');
    assert.equal(data.stage, 'cancelled');
  });
});

describe('who may ask', () => {
  test('somebody else cannot read this order', async () => {
    await assert.rejects(
      locationTrackingService.getOrderTrackingData(String(order._id), String(rider._id)),
      /Access denied/
    );
  });
});
