/**
 * scripts/approve-vendor.mjs, run for real as a child process against an
 * in-memory MongoDB - never the database in .env.
 *
 *     node --test tests/approve-vendor-script.test.mjs
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
delete process.env.MONGODB_URI;

const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: User } = await import('../models/User.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: FoodItem } = await import('../models/FoodItem.js');

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'approve-vendor.mjs');

let mongo;
let uri;
before(async () => {
  mongo = await MongoMemoryServer.create();
  uri = mongo.getUri('reditoe_approve_test');
  // The script reads backend/.env too, which points at the live database. An
  // environment variable wins over that file, so this must be the in-memory one.
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  await mongoose.connect(uri);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const run = (...args) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, MONGODB_URI: uri },
    encoding: 'utf8',
    timeout: 60000,
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};

const seed = async ({ status = 'pending', isEnabled = false, kycStatus = 'under_review' } = {}) => {
  await Promise.all([User.deleteMany({}), Restaurant.deleteMany({}), FoodItem.deleteMany({})]);
  const owner = await User.create({
    name: 'Kitchen', email: 'kitchen@example.com', phone: '+919219583594',
    password: 'whatever-1', role: 'vendor',
  });
  const restaurant = await Restaurant.create({
    name: 'Test Hotel',
    owner: owner._id,
    status,
    isEnabled,
    kycStatus,
    address: { coordinates: { latitude: 26.9, longitude: 80.9 } },
  });
  return { owner, restaurant };
};

describe('approve-vendor.mjs', () => {
  test('refuses without a usable number', () => {
    const res = run('12345');
    assert.equal(res.code, 1);
    assert.match(res.out, /Usage/);
  });

  test('a dry run reports and changes nothing', async () => {
    const { restaurant } = await seed();
    const res = run('9219583594');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /Dry run/);
    assert.match(res.out, /Test Hotel/);
    assert.match(res.out, /would set: status pending -> approved/);
    assert.match(res.out, /dry run - add --apply/);
    assert.match(res.out, /the menu is empty/);

    const after = await Restaurant.findById(restaurant._id);
    assert.equal(after.status, 'pending');
    assert.equal(after.isEnabled, false);
  });

  test('--apply approves and enables it, records it, and moves a KYC under review to approved', async () => {
    const { restaurant } = await seed();
    const res = run('+91 92195 83594', '--apply');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /APPROVED and enabled/);

    const after = await Restaurant.findById(restaurant._id);
    assert.equal(after.status, 'approved');
    assert.equal(after.isEnabled, true);
    assert.equal(after.kycStatus, 'approved');
    assert.ok(after.statusChangedAt);
    assert.equal(after.approvalHistory.at(-1).status, 'approved');
  });

  test('leaves a KYC that is not under review as it was', async () => {
    const { restaurant } = await seed({ kycStatus: 'pending' });
    run('9219583594', '--apply');
    const after = await Restaurant.findById(restaurant._id);
    assert.equal(after.status, 'approved');
    assert.equal(after.kycStatus, 'pending');
  });

  test('an already-approved restaurant is left alone', async () => {
    const { restaurant } = await seed({ status: 'approved', isEnabled: true, kycStatus: 'approved' });
    const before = await Restaurant.findById(restaurant._id);
    const res = run('9219583594', '--apply');
    assert.match(res.out, /already approved and enabled/);
    const after = await Restaurant.findById(restaurant._id);
    assert.equal(after.approvalHistory.length, before.approvalHistory.length);
  });

  test('only touches the account with that number, and only a vendor', async () => {
    const { restaurant } = await seed();
    await User.updateOne({ phone: '+919219583594' }, { role: 'user' });
    const res = run('9219583594', '--apply');
    assert.match(res.out, /not a vendor account/);
    assert.equal((await Restaurant.findById(restaurant._id)).status, 'pending');

    const stranger = run('9000000000', '--apply');
    assert.equal(stranger.code, 1);
    assert.match(stranger.out, /No account has the number/);
  });

  test('with several restaurants, --apply wants to be told which', async () => {
    const { owner, restaurant } = await seed();
    const second = await Restaurant.create({ name: 'Second', owner: owner._id });

    const ambiguous = run('9219583594', '--apply');
    assert.equal(ambiguous.code, 1);
    assert.match(ambiguous.out, /pass --restaurant <id>/);
    assert.equal((await Restaurant.findById(restaurant._id)).status, 'pending');

    const chosen = run('9219583594', '--apply', '--restaurant', String(restaurant._id));
    assert.equal(chosen.code, 0, chosen.out);
    assert.equal((await Restaurant.findById(restaurant._id)).status, 'approved');
    assert.equal((await Restaurant.findById(second._id)).status, 'pending');
  });
});

describe('a vendor account that has no restaurant', () => {
  test('looks wider and reports; never approves what it did not find under that owner', async () => {
    const { owner } = await seed();
    await Restaurant.deleteMany({});
    const other = await User.create({
      name: 'Other', email: 'other@example.com', phone: '+919000000001',
      password: 'whatever-1', role: 'vendor',
    });
    const stray = await Restaurant.create({
      name: 'Stray Kitchen', owner: other._id, phone: '+919219583594', status: 'pending',
    });

    const res = run('9219583594', '--apply');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /no restaurant found for this account/);
    assert.match(res.out, /No restaurant is owned by that account/);
    assert.match(res.out, /Stray Kitchen/);
    assert.match(res.out, /other@example\.com/);
    assert.equal((await Restaurant.findById(stray._id)).status, 'pending', 'must stay untouched');
    assert.ok(owner);
  });

  test('with nothing anywhere it says the registration never produced a restaurant', async () => {
    await seed();
    await Restaurant.deleteMany({});
    const res = run('9219583594');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /contact number ends 9219583594: none/);
    assert.match(res.out, /never produced a restaurant record/);
  });
});

describe('--create, for an account whose sign-up never made a restaurant', () => {
  const create = [
    '--create', '--name', 'Hotel Sai', '--street', 'Station Road', '--city', 'Lucknow',
    '--zip', '226001', '--cuisine', 'North Indian', '--lat', '26.9124', '--lng', '80.9462',
  ];

  const accountOnly = async () => {
    const { owner } = await seed();
    await Restaurant.deleteMany({});
    return owner;
  };

  test('a dry run says what it would create and writes nothing', async () => {
    await accountOnly();
    const res = run('9219583594', ...create);
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /would create "Hotel Sai" in Lucknow at 26\.9124, 80\.9462/);
    assert.match(res.out, /dry run - add --apply to create it/);
    assert.equal(await Restaurant.countDocuments(), 0);
  });

  test('--apply creates it, owned by the account, approved, enabled, with its location', async () => {
    const owner = await accountOnly();
    const res = run('9219583594', ...create, '--apply');
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /CREATED/);

    const made = await Restaurant.findOne({ owner: owner._id });
    assert.ok(made);
    assert.equal(made.name, 'Hotel Sai');
    assert.equal(made.status, 'approved');
    assert.equal(made.isEnabled, true);
    assert.equal(made.address.city, 'Lucknow');
    assert.equal(made.address.coordinates.latitude, 26.9124);
    assert.equal(made.address.coordinates.longitude, 80.9462);
    assert.deepEqual([...made.categories], ['North Indian']);
    assert.equal(made.phone, '+919219583594');
    assert.match(made.outletId, /^RES-/);
    assert.equal(made.approvalHistory.at(-1).status, 'approved');
  });

  test('asks for what is missing instead of guessing, and writes nothing', async () => {
    await accountOnly();
    const res = run('9219583594', '--create', '--name', 'Hotel Sai', '--apply');
    assert.equal(res.code, 1);
    assert.match(res.out, /still needed: --city <city>  --lat .*--lng /);
    assert.equal(await Restaurant.countDocuments(), 0);
  });

  test('refuses a position that is not in India, rather than listing it nowhere', async () => {
    await accountOnly();
    const res = run('9219583594', '--create', '--name', 'X', '--city', 'Y', '--lat', '0', '--lng', '0', '--apply');
    assert.equal(res.code, 1);
    assert.equal(await Restaurant.countDocuments(), 0);
  });

  test('never makes a second restaurant for an account that has one', async () => {
    await seed();
    const res = run('9219583594', ...create, '--apply');
    assert.equal(res.code, 1);
    assert.match(res.out, /already has a restaurant/);
    assert.equal(await Restaurant.countDocuments(), 1);
  });
});
