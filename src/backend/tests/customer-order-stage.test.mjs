/**
 * The four stages a customer is told about, read off the status every app
 * shares.
 *
 *     node --test tests/customer-order-stage.test.mjs
 *
 * Pure: no database, no server. The mapping is the thing under test.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { customerStageFor } = await import('../utils/customerOrderStage.js');

const T0 = new Date('2026-10-12T10:00:00.000Z');
const minutes = (n) => new Date(T0.getTime() + n * 60_000);

const RESTAURANT = { latitude: 12.9716, longitude: 77.5946 };
// About 1.1 km north of the restaurant.
const FAR_AWAY = { latitude: 12.9816, longitude: 77.5946 };
// About 20 m from it.
const AT_DOOR = { latitude: 12.97172, longitude: 77.5946 };

const orderWith = (status, extra = {}) => ({
  status,
  createdAt: T0,
  timeline: [],
  ...extra,
});

describe('before the rider has the food', () => {
  for (const status of [
    'Waiting for Confirmation',
    'Pending',
    'Order Confirmed',
    'In Progress',
    'Processing',
    'Ready',
    'RiderRejected',
  ]) {
    test(`${status} is preparing`, () => {
      assert.equal(customerStageFor(orderWith(status)).stage, 'preparing');
    });
  }

  test('a rider heading to the restaurant is still preparing', () => {
    // acceptOrder assigns the rider but leaves the status at 'Ready'.
    const order = orderWith('Ready', { riderId: 'rider-1' });
    assert.equal(customerStageFor(order).stage, 'preparing');
  });

  test('a status nobody has heard of is preparing, not the first stop of a different list', () => {
    assert.equal(customerStageFor(orderWith('Something New')).stage, 'preparing');
  });
});

describe('after pickup', () => {
  const pickedUp = (at) =>
    orderWith('OnWay', {
      pickupVerification: { verifiedAt: at },
      timeline: [{ status: 'OnWay', timestamp: at }],
    });

  test('just collected, rider still at the restaurant, is picked up', () => {
    const { stage } = customerStageFor(pickedUp(T0), {
      riderLocation: AT_DOOR,
      restaurantLocation: RESTAURANT,
      now: minutes(0.5),
    });
    assert.equal(stage, 'picked_up');
  });

  test('just collected with no position sent is picked up', () => {
    assert.equal(customerStageFor(pickedUp(T0), { now: minutes(0.5) }).stage, 'picked_up');
  });

  test('clear of the restaurant is on the way, however soon after pickup', () => {
    const { stage } = customerStageFor(pickedUp(T0), {
      riderLocation: FAR_AWAY,
      restaurantLocation: RESTAURANT,
      now: minutes(0.5),
    });
    assert.equal(stage, 'on_the_way');
  });

  test('a rider who never sends a position is not left on picked up', () => {
    assert.equal(customerStageFor(pickedUp(T0), { now: minutes(3) }).stage, 'on_the_way');
  });

  test('a rider lingering at the door is on the way once the grace period is over', () => {
    const { stage } = customerStageFor(pickedUp(T0), {
      riderLocation: AT_DOOR,
      restaurantLocation: RESTAURANT,
      now: minutes(5),
    });
    assert.equal(stage, 'on_the_way');
  });

  test('an unknown restaurant (0,0) does not make every rider look far away', () => {
    const { stage } = customerStageFor(pickedUp(T0), {
      riderLocation: FAR_AWAY,
      restaurantLocation: { latitude: 0, longitude: 0 },
      now: minutes(0.5),
    });
    assert.equal(stage, 'picked_up');
  });

  test('an admin who sets OnWay by hand still reads from the timeline', () => {
    const order = orderWith('OnWay', { timeline: [{ status: 'OnWay', timestamp: T0 }] });
    assert.equal(customerStageFor(order, { now: minutes(0.5) }).stage, 'picked_up');
    assert.equal(customerStageFor(order, { now: minutes(3) }).stage, 'on_the_way');
  });
});

describe('the end of the order', () => {
  test('Delivered is completed', () => {
    assert.equal(customerStageFor(orderWith('Delivered')).stage, 'completed');
  });

  test('Cancelled stays cancelled rather than being filed under a stage', () => {
    assert.equal(customerStageFor(orderWith('Cancelled')).stage, 'cancelled');
  });
});

describe('stage times', () => {
  test('come from what the order recorded, and are null where nothing was', () => {
    const order = orderWith('Delivered', {
      timeline: [
        { status: 'Order Confirmed', timestamp: minutes(1) },
        { status: 'Processing', timestamp: minutes(2) },
        { status: 'Ready', timestamp: minutes(10) },
        { status: 'OnWay', timestamp: minutes(14) },
        { status: 'Delivered', timestamp: minutes(30) },
      ],
      pickupVerification: { verifiedAt: minutes(14) },
    });
    const { times } = customerStageFor(order);
    assert.equal(times.preparing, minutes(2).toISOString());
    assert.equal(times.picked_up, minutes(14).toISOString());
    assert.equal(times.on_the_way, null);
    assert.equal(times.completed, minutes(30).toISOString());
  });

  test('a stage that has not happened has no time', () => {
    const { times } = customerStageFor(orderWith('Processing'));
    assert.equal(times.picked_up, null);
    assert.equal(times.completed, null);
  });

  test('preparing falls back to confirmation, then to when it was placed', () => {
    const confirmed = orderWith('Order Confirmed', {
      timeline: [{ status: 'Order Confirmed', timestamp: minutes(1) }],
    });
    assert.equal(customerStageFor(confirmed).times.preparing, minutes(1).toISOString());
    assert.equal(
      customerStageFor(orderWith('Waiting for Confirmation')).times.preparing,
      T0.toISOString()
    );
  });
});
