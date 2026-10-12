/**
 * The four stages the Live Tracking screen names, and what it falls back to
 * before the tracking feed has answered:
 *
 *     node --test tests/order-stage.test.mts
 *
 * The screen used to match the order's status against a table of its own and
 * take the first row when nothing matched, so a status the table did not name
 * left an order that a rider had already collected saying it was being
 * prepared. Every status the server can send is covered here.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { ORDER_STAGES, asStage, stageFromStatus, stageIndex } = await import(
  '../src/lib/order-stage.ts'
);

describe('the four words the customer is given', () => {
  test('are Preparing, Picked Up, On the Way and Completed, in that order', () => {
    assert.deepEqual(
      ORDER_STAGES.map((s) => s.label),
      ['Preparing', 'Picked Up', 'On the Way', 'Completed']
    );
  });
});

describe('a stage read off the status alone', () => {
  for (const status of [
    'Waiting for Confirmation',
    'Pending',
    'Payment Pending',
    'Order Confirmed',
    'In Progress',
    'Processing',
    'Ready',
    'RiderRejected',
  ]) {
    test(`${status} is preparing`, () => {
      assert.equal(stageFromStatus(status), 'preparing');
    });
  }

  test('OnWay is picked up until the feed can say whether the rider has set off', () => {
    assert.equal(stageFromStatus('OnWay'), 'picked_up');
  });

  test('Delivered is completed', () => {
    assert.equal(stageFromStatus('Delivered'), 'completed');
  });

  test('Cancelled and Refunded are cancelled', () => {
    assert.equal(stageFromStatus('Cancelled'), 'cancelled');
    assert.equal(stageFromStatus('Refunded'), 'cancelled');
  });

  test('no status at all is preparing', () => {
    assert.equal(stageFromStatus(undefined), 'preparing');
  });
});

describe('the stage the server reports', () => {
  test('is taken when it is one of ours', () => {
    for (const stage of ['preparing', 'picked_up', 'on_the_way', 'completed', 'cancelled']) {
      assert.equal(asStage(stage), stage);
    }
  });

  test('is ignored when it is not, so the fallback applies', () => {
    assert.equal(asStage('arriving'), null);
    assert.equal(asStage(undefined), null);
    assert.equal(asStage(3), null);
  });
});

describe('where a stage sits on the tracker', () => {
  test('follows the order of the four stops', () => {
    assert.deepEqual(
      ['preparing', 'picked_up', 'on_the_way', 'completed'].map((s) => stageIndex(s as never)),
      [0, 1, 2, 3]
    );
  });

  test('a cancelled order is on none of them', () => {
    assert.equal(stageIndex('cancelled'), -1);
  });
});
