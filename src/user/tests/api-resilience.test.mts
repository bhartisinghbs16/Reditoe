/**
 * How the customer app's API client behaves when the server stumbles.
 *
 * The home screen was showing "Route not found" - and, worse, emptying itself -
 * whenever one request landed on a server that was restarting or an instance
 * that did not have the route yet. These pin down what the client now does
 * instead:
 *
 *     npm run test:api
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).__DEV__ = true;
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api';

const { api, ApiError, loadCatalogue } = await import('../src/lib/api.ts');

type Reply = { status: number; body?: unknown; text?: string } | Error;
let replies: Reply[] = [];
let calls: string[] = [];
let inFlight = 0;
let maxInFlight = 0;
let handler: ((url: string) => Reply | Promise<Reply>) | null = null;

(globalThis as any).fetch = async (url: string) => {
  calls.push(url.replace('http://api.test/api', ''));
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  try {
    const next = handler ? await handler(url) : replies.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    if (next instanceof Error) throw next;
    const text = next.text ?? JSON.stringify(next.body ?? {});
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => text,
    };
  } finally {
    inFlight -= 1;
  }
};

beforeEach(() => {
  replies = [];
  calls = [];
  inFlight = 0;
  maxInFlight = 0;
  handler = null;
});

const routeMiss: Reply = {
  status: 404,
  body: { status: 'error', message: 'Route not found', path: '/api/restaurants' },
};
const apiRouteMiss: Reply = {
  status: 404,
  body: { status: 'error', message: 'API route not found', path: '/api/restaurants' },
};
const list = (...names: string[]): Reply => ({
  status: 200,
  body: {
    status: 'success',
    data: { restaurants: names.map((name) => ({ _id: name, name, categories: ['Indian'] })) },
  },
});

describe('a read that hits the router 404', () => {
  test('is asked again, and the customer never hears about it', async () => {
    replies = [routeMiss, list('Corner Kitchen')];
    const restaurants = await api.restaurants();
    assert.equal(restaurants.length, 1);
    assert.equal(calls.length, 2);
  });

  test('works for "API route not found" too', async () => {
    replies = [apiRouteMiss, apiRouteMiss, list('Corner Kitchen')];
    assert.equal((await api.restaurants()).length, 1);
    assert.equal(calls.length, 3);
  });

  test('when it keeps happening, says something a customer can use - not "Route not found"', async () => {
    replies = [routeMiss, routeMiss, routeMiss];
    await assert.rejects(
      () => api.restaurants(),
      (error: any) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'route_not_found');
        assert.doesNotMatch(error.message, /route/i);
        return true;
      }
    );
    assert.equal(calls.length, 3, 'one try and two retries, then it stops');
  });
});

describe('a refusal from a real handler', () => {
  test('is not retried and keeps its own message', async () => {
    replies = [
      {
        status: 404,
        body: {
          status: 'error',
          code: 'RESTAURANT_NOT_FOUND',
          message: 'Restaurant not found or unavailable',
        },
      },
    ];
    await assert.rejects(
      () => api.menu('abc'),
      (error: any) => error.code === 'RESTAURANT_NOT_FOUND' && /not found or unavailable/.test(error.message)
    );
    assert.equal(calls.length, 1);
  });

  test('a rate limit is not hammered', async () => {
    replies = [{ status: 429, body: { status: 'error', message: 'Too many requests from this IP' } }];
    await assert.rejects(() => api.restaurants(), (error: any) => error.status === 429);
    assert.equal(calls.length, 1);
  });
});

describe('other transient failures', () => {
  test('a proxy error page while the server restarts is retried', async () => {
    replies = [{ status: 502, text: '<html>Bad Gateway</html>' }, list('Corner Kitchen')];
    assert.equal((await api.restaurants()).length, 1);
    assert.equal(calls.length, 2);
  });

  test('a dropped connection is retried', async () => {
    replies = [new TypeError('Network request failed'), list('Corner Kitchen')];
    assert.equal((await api.restaurants()).length, 1);
  });

  test('a timeout is not: it has already cost the whole wait', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    replies = [abort];
    await assert.rejects(() => api.restaurants(), (error: any) => error.code === 'timeout');
    assert.equal(calls.length, 1);
  });

  test('a write is never repeated - it could place an order twice', async () => {
    replies = [{ status: 503, text: 'Service Unavailable' }];
    await assert.rejects(() => api.sendOtp('9876543210'));
    assert.equal(calls.length, 1);
  });
});

describe('loading the catalogue', () => {
  const dish = (restaurantId: string, name: string) =>
    ({ id: `${restaurantId}-${name}`, restaurantId, name, price: 100 }) as any;

  test('a menu that will not load keeps the dishes it had', async () => {
    handler = (url) => {
      if (url.includes('/restaurants/A/menu')) return { status: 500, body: { status: 'error', message: 'boom' } };
      if (url.includes('/restaurants/B/menu')) {
        return { status: 200, body: { data: { menu: [{ _id: 'b1', name: 'Fresh', price: 90 }] } } };
      }
      return list('A', 'B');
    };

    const { restaurants, dishes } = await loadCatalogue(undefined, [dish('A', 'Old biryani')]);
    assert.equal(restaurants.length, 2);
    assert.deepEqual(
      dishes.map((entry) => entry.name).sort(),
      ['Fresh', 'Old biryani']
    );
  });

  test('menus are fetched a few at a time, not all at once', async () => {
    const names = Array.from({ length: 14 }, (_, index) => `R${index}`);
    handler = async (url) => {
      if (url.includes('/menu')) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { status: 200, body: { data: { menu: [] } } };
      }
      return list(...names);
    };

    const { restaurants } = await loadCatalogue();
    assert.equal(restaurants.length, 14);
    assert.ok(maxInFlight <= 5, `${maxInFlight} requests were in flight at once`);
    assert.ok(maxInFlight > 1, 'and they still run side by side');
  });

  test('when the list itself fails, it throws so the caller can keep what is on screen', async () => {
    replies = [{ status: 429, body: { status: 'error', message: 'Too many requests' } }];
    await assert.rejects(() => loadCatalogue(), (error: any) => error.status === 429);
  });
});
