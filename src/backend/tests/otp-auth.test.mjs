/**
 * OTP-only sign-in, end to end against the real routes and controllers.
 *
 * Runs on an in-memory MongoDB and a stubbed SMS provider, so it touches
 * nothing outside this process:
 *
 *     node --test tests/otp-auth.test.mjs
 *
 * Environment is set before anything is imported on purpose: the JWT, SMS and
 * upload modules read it once, at load.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
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
delete process.env.ALLOW_DEBUG_OTP;
delete process.env.MONGODB_URI;

// multer writes uploads under the working directory; keep them out of the repo.
const home = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-otp-test-'));
process.chdir(scratch);

const { default: express } = await import('express');
const { default: bcrypt } = await import('bcryptjs');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: axios } = await import('axios');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { registerVendor } = await import('../controllers/user/authController.js');
const { registerRider } = await import('../controllers/riderRegistrationController.js');
const { issueVerifiedProof } = await import('../controllers/signupVerificationController.js');
const { protect } = await import('../middleware/auth.js');
const { updateVendorProfile } = await import('../controllers/vendorController.js');
const { default: cloudStorage } = await import('../services/cloudStorageService.js');
const { default: User } = await import('../models/User.js');
const { default: LoginOtp } = await import('../models/LoginOtp.js');
const { default: SignupVerification } = await import('../models/SignupVerification.js');
const { default: DeviceSession } = await import('../models/DeviceSession.js');
const { default: Restaurant } = await import('../models/Restaurant.js');

/** Every message the SMS provider was asked to carry, newest last. */
let sms = [];
let smsShouldFail = false;
axios.post = async (url, body) => {
  if (smsShouldFail) throw new Error('provider down');
  sms.push({ url, ...body.recipients[0], template: body.template_id });
  return { data: { type: 'success' } };
};

cloudStorage.uploadFile = async () => ({ publicUrl: 'https://cdn.example.test/profile.png' });

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.post('/api/vendor/register', registerVendor);
app.post('/api/rider/register', registerRider);
// What the vendor routes do before the handler: find who is signed in and their kitchen.
app.put(
  '/api/vendor/profile',
  protect,
  async (req, res, next) => {
    req.restaurant = await Restaurant.findOne({ owner: req.user._id });
    next();
  },
  updateVendorProfile
);

// A 1x1 PNG: a real image, so the upload filter has nothing to object to.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_test'));
  await Promise.all([
    User.init(),
    LoginOtp.init(),
    SignupVerification.init(),
    DeviceSession.init(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  // Not while it is still the working directory: Windows refuses.
  process.chdir(home);
  fs.rmSync(scratch, { recursive: true, force: true });
});

beforeEach(async () => {
  sms = [];
  smsShouldFail = false;
  process.env.NODE_ENV = 'test';
  await Promise.all([
    User.deleteMany({}),
    LoginOtp.deleteMany({}),
    SignupVerification.deleteMany({}),
    DeviceSession.deleteMany({}),
    Restaurant.deleteMany({}),
  ]);
});

const sendCode = (phone, role = 'user') =>
  request(app).post('/api/auth/send-otp').send({ phone, role });

/** Asks for a code and returns the six digits the provider was handed. */
const codeFor = async (phone, role = 'user') => {
  const res = await sendCode(phone, role);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return sms.at(-1)[process.env.MSG91_OTP_VAR || 'num'];
};

const verify = (phone, otp, role = 'user') =>
  request(app).post('/api/auth/verify-otp').send({ phone, otp, role });

/** Lets the next code be asked for immediately. */
const skipCooldown = (phone) =>
  LoginOtp.updateOne({ phone }, { sentAt: new Date(Date.now() - 60_000) });

const newCustomer = async (phone = '9876543210') => {
  const code = await codeFor(phone);
  const verified = await verify(phone, code);
  assert.equal(verified.body.isNewUser, true);
  return verified.body.phoneProof;
};

const signUp = (fields, { photo = true } = {}) => {
  const req = request(app).post('/api/auth/register');
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) req.field(key, value);
  }
  if (photo) req.attach('profilePhoto', PNG, { filename: 'me.png', contentType: 'image/png' });
  return req;
};

const customer = (proof, overrides = {}) => ({
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  phoneProof: proof,
  dateOfBirth: '1994-03-21',
  ...overrides,
});

describe('asking for a code', () => {
  test('sends six digits to the number and stores only a hash', async () => {
    const res = await sendCode('98765 43210');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.phone, '+919876543210');
    assert.equal(res.body.devOtp, undefined, 'the code must not come back when it was texted');

    assert.equal(sms.length, 1);
    const code = sms[0].num;
    assert.match(code, /^\d{6}$/);
    assert.equal(sms[0].mobiles, '919876543210');
    assert.equal(sms[0].template, 'tpl-default');

    const row = await LoginOtp.findOne({ phone: '+919876543210' }).select('+codeHash');
    assert.ok(row.codeHash);
    assert.notEqual(row.codeHash, code);
    assert.ok(!JSON.stringify(row.toObject()).includes(code));
  });

  test('uses the vendor and delivery-partner templates for those apps', async () => {
    await sendCode('9876543210', 'vendor');
    assert.equal(sms.at(-1).template, 'tpl-vendor');
    await sendCode('9123456780', 'rider');
    assert.equal(sms.at(-1).template, 'tpl-rider');
  });

  test('refuses an email address, by name', async () => {
    const res = await request(app).post('/api/auth/send-otp').send({ emailOrPhone: 'a@b.com' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /no longer available/i);
    assert.equal(sms.length, 0);
  });

  test('refuses numbers that are not Indian mobiles, and unknown roles', async () => {
    for (const phone of ['12345', '5876543210', 'abcdefghij', '']) {
      const res = await sendCode(phone);
      assert.equal(res.status, 400, phone);
    }
    const res = await sendCode('9876543210', 'admin');
    assert.equal(res.status, 400);
    assert.equal(sms.length, 0);
  });

  test('a double tap is answered as the cooldown, never as a server fault', async () => {
    const both = await Promise.all([sendCode('9876543210'), sendCode('9876543210')]);
    const statuses = both.map((res) => res.status).sort();
    assert.ok(statuses.includes(200), `neither request succeeded: ${statuses}`);
    assert.ok(statuses.every((status) => status === 200 || status === 429), `got ${statuses}`);
    assert.equal(sms.length >= 1 && sms.length <= 2, true);
  });

  test('will not send again inside the cooldown', async () => {
    await sendCode('9876543210');
    const again = await sendCode('9876543210');
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'otp_too_soon');
    assert.ok(again.body.retryAfterSeconds > 0 && again.body.retryAfterSeconds <= 30);
    assert.equal(sms.length, 1);
  });

  test('caps how many codes one number gets in an hour', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await sendCode('9876543210');
      assert.equal(res.status, 200, `send ${i + 1}`);
      await skipCooldown('+919876543210');
    }
    const sixth = await sendCode('9876543210');
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.code, 'otp_limit');
    assert.equal(sms.length, 5);
  });

  test('a production server with no way to send does not hand the code out', async () => {
    process.env.NODE_ENV = 'production';
    smsShouldFail = true;
    const res = await sendCode('9876543210');
    assert.equal(res.status, 503);
    assert.equal(res.body.devOtp, undefined);
    assert.ok(!JSON.stringify(res.body).match(/\d{6}/));
  });

  test('ignores forged host headers when deciding whether to reveal the code', async () => {
    process.env.NODE_ENV = 'production';
    smsShouldFail = true;
    const res = await request(app)
      .post('/api/auth/send-otp')
      .set('X-Forwarded-Host', 'localhost')
      .set('Host', 'localhost')
      .send({ phone: '9876543210', role: 'user' });
    assert.equal(res.status, 503);
    assert.equal(res.body.devOtp, undefined);
  });

  test('outside production, with no provider, the code comes back so sign-up can be tried', async () => {
    smsShouldFail = true;
    const res = await sendCode('9876543210');
    assert.equal(res.status, 200);
    assert.match(res.body.devOtp, /^\d{6}$/);
    const verified = await verify('9876543210', res.body.devOtp);
    assert.equal(verified.status, 200);
  });
});

describe('checking a code', () => {
  test('a number nobody has registered gets a proof and no session', async () => {
    const code = await codeFor('9876543210');
    const res = await verify('9876543210', code);
    assert.equal(res.status, 200);
    assert.equal(res.body.isNewUser, true);
    assert.equal(res.body.token, undefined);
    assert.match(res.body.phoneProof, /^[0-9a-f]{48}$/);
    assert.equal(res.body.phone, '+919876543210');
    assert.equal(await User.countDocuments(), 0, 'no placeholder account may be created');
  });

  test('a registered number is signed in directly', async () => {
    await User.create({
      name: 'Asha', email: 'asha@example.com', phone: '+919876543210',
      password: 'whatever-1', role: 'user',
    });
    const code = await codeFor('9876543210');
    const res = await verify('9876543210', code);
    assert.equal(res.status, 200);
    assert.equal(res.body.isNewUser, false);
    assert.ok(res.body.token);
    assert.equal(res.body.data.user.email, 'asha@example.com');
    assert.equal(res.body.data.user.role, 'user');
  });

  test('finds an account whose number was saved without the +91', async () => {
    await User.create({
      name: 'Old', email: 'old@example.com', phone: '9876543210',
      password: 'whatever-1', role: 'user',
    });
    const code = await codeFor('9876543210');
    const res = await verify('+91 98765 43210', code);
    assert.equal(res.body.isNewUser, false);
  });

  test('a code works once', async () => {
    const code = await codeFor('9876543210');
    assert.equal((await verify('9876543210', code)).status, 200);
    const replay = await verify('9876543210', code);
    assert.equal(replay.status, 400);
    assert.equal(replay.body.code, 'otp_expired');
  });

  test('a wrong code is refused and counted; the fifth wrong one locks it', async () => {
    const code = await codeFor('9876543210');
    const wrong = code === '000000' ? '111111' : '000000';

    const first = await verify('9876543210', wrong);
    assert.equal(first.status, 400);
    assert.match(first.body.message, /4 attempts left/);

    for (let i = 0; i < 3; i += 1) await verify('9876543210', wrong);
    const last = await verify('9876543210', wrong);
    assert.equal(last.status, 400);
    assert.match(last.body.message, /Too many/);

    // Even the right code is now refused until a new one is asked for.
    const locked = await verify('9876543210', code);
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'otp_attempts');
  });

  test('a burst of parallel guesses cannot exceed the attempt limit', async () => {
    const code = await codeFor('9876543210');
    const wrong = code === '000000' ? '111111' : '000000';
    const burst = await Promise.all(
      Array.from({ length: 25 }, () => verify('9876543210', wrong))
    );
    const answered = burst.filter((res) => res.body.code === 'otp_wrong').length;
    assert.ok(answered <= 5, `${answered} guesses were let through`);
    assert.ok(burst.some((res) => res.status === 429));
    assert.equal((await verify('9876543210', code)).status, 429);
  });

  test('asking for a new code starts the guesses again', async () => {
    const first = await codeFor('9876543210');
    const wrong = first === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) await verify('9876543210', wrong);
    await skipCooldown('+919876543210');
    const fresh = await codeFor('9876543210');
    assert.equal((await verify('9876543210', fresh)).status, 200);
  });

  test('an expired code is refused', async () => {
    const code = await codeFor('9876543210');
    await LoginOtp.updateOne({ phone: '+919876543210' }, { codeExpiresAt: new Date(Date.now() - 1000) });
    const res = await verify('9876543210', code);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'otp_expired');
  });

  test('a code asked for on one app does not open another', async () => {
    const code = await codeFor('9876543210', 'user');
    const res = await verify('9876543210', code, 'vendor');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'otp_wrong');
  });

  test('a number registered under another role is told so, not signed in', async () => {
    await User.create({
      name: 'Kitchen', email: 'k@example.com', phone: '+919876543210',
      password: 'whatever-1', role: 'vendor',
    });
    const code = await codeFor('9876543210', 'user');
    const res = await verify('9876543210', code, 'user');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'wrong_app');
    assert.equal(res.body.token, undefined);
  });

  test('a suspended account is not signed in', async () => {
    await User.create({
      name: 'Asha', email: 'asha@example.com', phone: '+919876543210',
      password: 'whatever-1', role: 'user', isBlocked: true,
    });
    const code = await codeFor('9876543210');
    const res = await verify('9876543210', code);
    assert.equal(res.status, 403);
    assert.equal(res.body.token, undefined);
  });

  test('an admin account cannot be opened from any of the three apps', async () => {
    await User.create({
      name: 'Boss', email: 'boss@example.com', phone: '+919876543210',
      password: 'whatever-1', role: 'admin',
    });
    for (const role of ['user', 'vendor', 'rider']) {
      const code = await codeFor('9876543210', role);
      const res = await verify('9876543210', code, role);
      assert.equal(res.status, 403, role);
      assert.equal(res.body.token, undefined);
      await skipCooldown('+919876543210');
    }
  });
});

describe('signing up as a customer', () => {
  test('verify, then register with the proof: a session, no password anywhere', async () => {
    const proof = await newCustomer();
    const res = await signUp(customer(proof));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.token);

    const user = res.body.data.user;
    assert.equal(user.name, 'Asha Rao');
    assert.equal(user.email, 'asha@example.com');
    assert.equal(user.phone, '+919876543210');
    assert.equal(user.role, 'user');
    assert.equal(user.avatar, 'https://cdn.example.test/profile.png');
    assert.equal(user.password, undefined);

    const stored = await User.findOne({ email: 'asha@example.com' });
    assert.equal(stored.dateOfBirth.toISOString().slice(0, 10), '1994-03-21');
    assert.equal(stored.accountVerified, true);
    assert.equal(stored.walletBalance, 0);
  });

  test('the same number then signs in directly', async () => {
    const proof = await newCustomer();
    await signUp(customer(proof));
    await LoginOtp.deleteMany({});
    const code = await codeFor('9876543210');
    const res = await verify('9876543210', code);
    assert.equal(res.body.isNewUser, false);
    assert.equal(res.body.data.user.email, 'asha@example.com');
  });

  test('is refused without a proof, or with one for a different number', async () => {
    const none = await signUp(customer(undefined));
    assert.equal(none.status, 400);
    assert.equal(none.body.code, 'contact_not_verified');

    const forged = await signUp(customer('f'.repeat(48)));
    assert.equal(forged.status, 400);
    assert.equal(forged.body.code, 'contact_not_verified');

    const proof = await newCustomer('9876543210');
    const other = await signUp(customer(proof, { phone: '9123456780' }));
    assert.equal(other.status, 400);
    assert.equal(other.body.code, 'contact_not_verified');
    assert.equal(await User.countDocuments(), 0);
  });

  test('a proof is good for one account', async () => {
    const proof = await newCustomer();
    assert.equal((await signUp(customer(proof))).status, 201);
    const again = await signUp(customer(proof, { email: 'second@example.com' }));
    assert.ok([400, 409].includes(again.status));
    assert.equal(await User.countDocuments(), 1);
  });

  test('wants every detail: name, email, date of birth and a photo', async () => {
    const proof = await newCustomer();
    const cases = [
      [customer(proof, { name: 'A' }), {}],
      [customer(proof, { email: 'not-an-email' }), {}],
      [customer(proof, { email: undefined }), {}],
      [customer(proof, { dateOfBirth: undefined }), {}],
      [customer(proof, { dateOfBirth: '31/02/2000' }), {}],
      [customer(proof, { dateOfBirth: '2999-01-01' }), {}],
      [customer(proof), { photo: false }],
    ];
    for (const [fields, options] of cases) {
      const res = await signUp(fields, options);
      assert.equal(res.status, 400, JSON.stringify(fields));
    }
    assert.equal(await User.countDocuments(), 0);
    // None of those spent the proof.
    assert.equal((await signUp(customer(proof))).status, 201);
  });

  test('never leaves an uploaded photo on disk, whatever the answer', async () => {
    const dir = path.join(scratch, 'uploads', 'profile-photos');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
    const leftOver = () => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);

    // Refused: no proof.
    assert.equal((await signUp(customer(undefined))).status, 400);
    await settle();
    assert.equal(leftOver(), 0, 'a refused request kept its photo');

    // Refused: bad details, with a good proof.
    const proof = await newCustomer();
    assert.equal((await signUp(customer(proof, { email: 'nope' }))).status, 400);
    await settle();
    assert.equal(leftOver(), 0);

    // Accepted.
    assert.equal((await signUp(customer(proof))).status, 201);
    await settle();
    assert.equal(leftOver(), 0, 'the temporary copy outlived a successful sign-up');
  });

  test('accepts the date as DD/MM/YYYY too', async () => {
    const proof = await newCustomer();
    const res = await signUp(customer(proof, { dateOfBirth: '21/03/1994' }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test('an email somebody already has is refused without naming them', async () => {
    await User.create({
      name: 'Other', email: 'asha@example.com', phone: '+919000000000',
      password: 'whatever-1', role: 'vendor',
    });
    const proof = await newCustomer();
    const res = await signUp(customer(proof));
    assert.equal(res.status, 409);
    assert.ok(!JSON.stringify(res.body).includes('vendor'));
  });

  test('the proof cannot be collected by somebody who only knows the number', async () => {
    await newCustomer('9876543210');

    const { confirmSignupCode } = await import('../controllers/signupVerificationController.js');
    const mini = express();
    mini.use(express.json());
    mini.post('/confirm', confirmSignupCode);
    const direct = await request(mini)
      .post('/confirm')
      .send({ channel: 'phone', value: '9876543210', code: '000000' });
    assert.equal(direct.status, 409);
    assert.equal(direct.body.data, undefined);
  });
});

describe('password and other sign-in are gone', () => {
  test('/login, /google and /set-password answer 410 with a reason', async () => {
    await User.create({
      name: 'Asha', email: 'asha@example.com', phone: '+919876543210',
      password: 'Correct-horse-1', role: 'user',
    });
    for (const [route, body] of [
      ['/api/auth/login', { emailOrPhone: 'asha@example.com', password: 'Correct-horse-1' }],
      ['/api/auth/login', { emailOrPhone: '9876543210', password: 'Correct-horse-1' }],
      ['/api/auth/google', { idToken: 'x' }],
      ['/api/auth/set-password', { password: 'Another-pass-1' }],
    ]) {
      const res = await request(app).post(route).send(body);
      assert.equal(res.status, 410, route);
      assert.equal(res.body.code, 'password_login_removed');
      assert.equal(res.body.token, undefined, 'a correct password must not produce a session');
    }
  });

  test('the old verification endpoints no longer exist', async () => {
    for (const route of ['/api/auth/verify-account', '/api/auth/resend-verification']) {
      const res = await request(app).post(route).send({ emailOrPhone: '9876543210', otp: '123456' });
      assert.equal(res.status, 404, route);
    }
  });
});

describe('the number is the identity', () => {
  test('a profile edit cannot change it', async () => {
    const proof = await newCustomer();
    const { body } = await signUp(customer(proof));
    const auth = { Authorization: `Bearer ${body.token}` };

    const stolen = await request(app).put('/api/auth/profile').set(auth).send({ phone: '9123456780' });
    assert.equal(stolen.status, 400);
    assert.equal(stolen.body.code, 'phone_locked');

    const same = await request(app).put('/api/auth/profile').set(auth)
      .send({ name: 'Asha R', phone: '+91 98765 43210' });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal(same.body.data.user.name, 'Asha R');
    assert.equal((await User.findOne({ email: 'asha@example.com' })).phone, '+919876543210');
  });
});

describe('the vendor profile form', () => {
  test('changes the restaurant contact number, never the number the vendor signs in with', async () => {
    const verified = await verify('9812345670', await codeFor('9812345670', 'vendor'), 'vendor');
    const emailProof = await issueVerifiedProof('email', 'owner@kitchen.example');
    const registered = await request(app).post('/api/vendor/register').send({
      restaurantName: 'Corner Kitchen',
      phone: '9812345670',
      email: 'owner@kitchen.example',
      phoneProof: verified.body.phoneProof,
      emailProof,
      city: 'Chennai',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));

    const res = await request(app)
      .put('/api/vendor/profile')
      .set({ Authorization: `Bearer ${registered.body.token}` })
      .send({ phone: '9000000001' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const owner = await User.findOne({ email: 'owner@kitchen.example' });
    assert.equal(owner.phone, '+919812345670', 'the sign-in number must not move');
    const kitchen = await Restaurant.findOne({ owner: owner._id });
    assert.equal(kitchen.phone, '9000000001', "the contact number is the vendor's to change");
  });
});

describe('signing up as a vendor or a delivery partner', () => {
  test('vendor: number proved by code, restaurant registered without a password', async () => {
    const code = await codeFor('9812345670', 'vendor');
    const verified = await verify('9812345670', code, 'vendor');
    assert.equal(verified.body.isNewUser, true);

    const emailProof = await issueVerifiedProof('email', 'owner@kitchen.example');
    const res = await request(app).post('/api/vendor/register').send({
      restaurantName: 'Corner Kitchen',
      contactPersonName: 'Priya',
      phone: '9812345670',
      email: 'owner@kitchen.example',
      phoneProof: verified.body.phoneProof,
      emailProof,
      city: 'Chennai',
      street: '12 Anna Salai',
      zipCode: '600002',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.token);
    assert.equal(res.body.data.user.role, 'vendor');
    assert.equal(await Restaurant.countDocuments({ name: 'Corner Kitchen' }), 1);

    // ...and from now on the same number signs in directly, on the vendor app.
    await LoginOtp.deleteMany({});
    const again = await verify('9812345670', await codeFor('9812345670', 'vendor'), 'vendor');
    assert.equal(again.body.isNewUser, false);
    assert.equal(again.body.data.user.role, 'vendor');
  });

  test('vendor: refused without a mobile number, or with an unproved one', async () => {
    const base = { restaurantName: 'Corner Kitchen', city: 'Chennai' };
    const none = await request(app).post('/api/vendor/register').send(base);
    assert.equal(none.status, 400);

    const unproved = await request(app).post('/api/vendor/register').send({
      ...base, phone: '9812345670', phoneProof: 'a'.repeat(48),
    });
    assert.equal(unproved.status, 400);
    assert.equal(unproved.body.code, 'contact_not_verified');
    assert.equal(await Restaurant.countDocuments(), 0);
  });

  const riderBody = (phoneProof, emailProof) => ({
    name: 'Ravi Kumar',
    email: 'ravi@example.com',
    phone: '9123456780',
    phoneProof,
    emailProof,
    dateOfBirth: '1996-05-12',
    vehicleType: 'bike',
    vehicleNumber: 'TN01AB1234',
    vehicleBrand: 'Honda',
    vehicleModel: 'Shine',
    accountHolderName: 'Ravi Kumar',
    accountNumber: '123456789012',
    ifscCode: 'HDFC0001234',
    bankName: 'HDFC',
    branchName: 'Savings Account',
  });

  test('partner: both contact details proved, no password, account created', async () => {
    const code = await codeFor('9123456780', 'rider');
    const verified = await verify('9123456780', code, 'rider');
    assert.equal(verified.body.isNewUser, true);
    const emailProof = await issueVerifiedProof('email', 'ravi@example.com');

    const res = await request(app)
      .post('/api/rider/register')
      .send(riderBody(verified.body.phoneProof, emailProof));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.rider.role, 'rider');

    await LoginOtp.deleteMany({});
    const again = await verify('9123456780', await codeFor('9123456780', 'rider'), 'rider');
    assert.equal(again.body.isNewUser, false);
    assert.equal(again.body.data.user.role, 'rider');
    assert.ok(again.body.data.user.riderId);
  });

  test('partner: leaving the password out no longer skips the proof check', async () => {
    const res = await request(app).post('/api/rider/register').send(riderBody(undefined, undefined));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'contact_not_verified');
    assert.equal(await User.countDocuments(), 0);
  });
});

describe('remembering a device', () => {
  const PHONE = '+919876543210';
  const asha = (overrides = {}) =>
    User.create({
      name: 'Asha', email: 'asha@example.com', phone: PHONE,
      password: 'whatever-1', role: 'user', ...overrides,
    });

  /*
   * The code is written straight into the table rather than asked for through
   * /send-otp: this suite shares one network address, and the per-network send
   * limit (which is itself under test above) would otherwise run out part way
   * through. Verifying it still goes through the real endpoint.
   */
  const CODE = '123456';
  const plantCode = async (role) =>
    LoginOtp.findOneAndUpdate(
      { phone: PHONE },
      {
        phone: PHONE,
        role,
        codeHash: await bcrypt.hash(CODE, 4),
        attempts: 0,
        sentAt: new Date(),
        codeExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        windowStartedAt: new Date(),
        sendsInWindow: 1,
        expiresAt: new Date(Date.now() + 65 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

  /** Signs in with a code, telling the server which phone this is. */
  const signInOn = async (deviceId, role = 'user') => {
    await plantCode(role);
    return request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', otp: CODE, role, deviceId });
  };

  const comeBack = (deviceId, rememberToken, extra = {}) =>
    request(app).post('/api/auth/remember-login').send({ deviceId, rememberToken, role: 'user', ...extra });

  const DAY = 24 * 60 * 60 * 1000;
  const deviceA = 'device-aaaaaaaaaaaaaaaa';
  const deviceB = 'device-bbbbbbbbbbbbbbbb';
  const deviceC = 'device-cccccccccccccccc';
  const deviceD = 'device-dddddddddddddddd';

  test('a code that signs in with a device id also remembers the phone, as a hash', async () => {
    await asha();
    const res = await signInOn(deviceA);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.token);
    assert.ok(res.body.rememberToken && res.body.rememberToken.length >= 40);

    const days = (new Date(res.body.rememberExpiresAt).getTime() - Date.now()) / DAY;
    assert.ok(days > 29 && days <= 30, `expires in ${days} days`);

    const row = await DeviceSession.findOne({ deviceId: deviceA });
    assert.ok(row);
    assert.notEqual(row.secretHash, res.body.rememberToken);
    assert.ok(!JSON.stringify(row.toObject()).includes(res.body.rememberToken));
  });

  test('without a device id nothing is remembered', async () => {
    await asha();
    const res = await signInOn(undefined);
    assert.equal(res.status, 200);
    assert.equal(res.body.rememberToken, undefined);
    assert.equal(await DeviceSession.countDocuments(), 0);

    const junk = await signInOn('short');
    assert.equal(junk.body.rememberToken, undefined);
    assert.equal(await DeviceSession.countDocuments(), 0);
  });

  test('a remembered phone is signed in again with no code', async () => {
    await asha();
    const first = await signInOn(deviceA);
    const smsBefore = sms.length;

    const back = await comeBack(deviceA, first.body.rememberToken, { phone: '98765 43210' });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.isNewUser, false);
    assert.equal(back.body.data.user.email, 'asha@example.com');
    assert.equal(sms.length, smsBefore, 'no code should be sent');

    // The session it hands out is a real one.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${back.body.token}`);
    assert.equal(me.status, 200);
  });

  test('the secret is only good on the phone it was issued to, for the app it was issued to', async () => {
    await asha();
    const first = await signInOn(deviceA);
    const secret = first.body.rememberToken;

    assert.equal((await comeBack(deviceB, secret)).status, 401, 'another phone');
    assert.equal((await comeBack(deviceA, secret.slice(0, -1) + 'x')).status, 401, 'wrong secret');
    assert.equal((await comeBack(deviceA, '')).status, 401, 'no secret');
    assert.equal((await comeBack(deviceA, secret, { role: 'vendor' })).status, 401, 'another app');
    assert.equal((await comeBack(deviceA, secret, { role: 'admin' })).status, 401, 'not an app');
    assert.equal((await comeBack(deviceA, secret, { phone: '9123456780' })).status, 401, 'another number');

    // None of that spent it.
    assert.equal((await comeBack(deviceA, secret)).status, 200);
  });

  test('it expires on a fixed date, and using it does not extend that date', async () => {
    await asha();
    const first = await signInOn(deviceA);
    const before = (await DeviceSession.findOne({ deviceId: deviceA })).expiresAt.getTime();

    assert.equal((await comeBack(deviceA, first.body.rememberToken)).status, 200);
    const after = (await DeviceSession.findOne({ deviceId: deviceA })).expiresAt.getTime();
    assert.equal(after, before, 'coming back must not push the date out');

    await DeviceSession.updateOne({ deviceId: deviceA }, { expiresAt: new Date(Date.now() - 1000) });
    const lapsed = await comeBack(deviceA, first.body.rememberToken);
    assert.equal(lapsed.status, 401);
    assert.equal(lapsed.body.code, 'remember_invalid');
  });

  test('signing in again on the same phone replaces what it held', async () => {
    await asha();
    const first = await signInOn(deviceA);
    const second = await signInOn(deviceA);
    assert.equal(await DeviceSession.countDocuments(), 1);
    assert.equal((await comeBack(deviceA, first.body.rememberToken)).status, 401);
    assert.equal((await comeBack(deviceA, second.body.rememberToken)).status, 200);
  });

  test('an account keeps only three phones; the one used longest ago is dropped', async () => {
    await asha();
    const a = await signInOn(deviceA);
    const b = await signInOn(deviceB);
    const c = await signInOn(deviceC);

    // Phone A is used, so B is now the one that has gone longest.
    assert.equal((await comeBack(deviceA, a.body.rememberToken)).status, 200);

    const d = await signInOn(deviceD);
    assert.equal(await DeviceSession.countDocuments(), 3);

    assert.equal((await comeBack(deviceB, b.body.rememberToken)).status, 401, 'B was evicted');
    assert.equal((await comeBack(deviceA, a.body.rememberToken)).status, 200);
    assert.equal((await comeBack(deviceC, c.body.rememberToken)).status, 200);
    assert.equal((await comeBack(deviceD, d.body.rememberToken)).status, 200);
  });

  test('the limits can be tightened from the environment', async () => {
    await asha();
    process.env.MAX_REMEMBERED_DEVICES = '1';
    process.env.REMEMBER_DEVICE_DAYS = '2';
    try {
      const a = await signInOn(deviceA);
      const days = (new Date(a.body.rememberExpiresAt).getTime() - Date.now()) / DAY;
      assert.ok(days > 1.9 && days <= 2, `expires in ${days} days`);

      await signInOn(deviceB);
      assert.equal(await DeviceSession.countDocuments(), 1);
      assert.equal((await comeBack(deviceA, a.body.rememberToken)).status, 401);
    } finally {
      delete process.env.MAX_REMEMBERED_DEVICES;
      delete process.env.REMEMBER_DEVICE_DAYS;
    }
  });

  test('a suspended account is refused, and its remembered phone is forgotten', async () => {
    const user = await asha();
    const first = await signInOn(deviceA);
    await User.updateOne({ _id: user._id }, { isBlocked: true });

    const res = await comeBack(deviceA, first.body.rememberToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.token, undefined);
    assert.equal(await DeviceSession.countDocuments(), 0);
  });

  test('signing out revokes it, and says nothing about whether the secret was good', async () => {
    await asha();
    const first = await signInOn(deviceA);

    const out = await request(app)
      .post('/api/auth/forget-device')
      .send({ deviceId: deviceA, rememberToken: first.body.rememberToken });
    assert.equal(out.status, 200);
    assert.equal(await DeviceSession.countDocuments(), 0);
    assert.equal((await comeBack(deviceA, first.body.rememberToken)).status, 401);

    const junk = await request(app)
      .post('/api/auth/forget-device')
      .send({ deviceId: deviceA, rememberToken: 'not-a-secret-at-all' });
    assert.equal(junk.status, 200);
  });

  test('forgetting one phone leaves the others alone', async () => {
    await asha();
    const a = await signInOn(deviceA);
    const b = await signInOn(deviceB);
    await request(app)
      .post('/api/auth/forget-device')
      .send({ deviceId: deviceA, rememberToken: a.body.rememberToken });
    assert.equal((await comeBack(deviceB, b.body.rememberToken)).status, 200);
  });

  test('a new customer is remembered as soon as the account exists', async () => {
    const proof = await issueVerifiedProof('phone', PHONE);
    const res = await signUp(customer(proof, { deviceId: deviceA }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.rememberToken);

    const back = await comeBack(deviceA, res.body.rememberToken);
    assert.equal(back.status, 200);
    assert.equal(back.body.data.user.email, 'asha@example.com');
  });

  test('a sign-up without a device id still works, and remembers nothing', async () => {
    const proof = await issueVerifiedProof('phone', PHONE);
    const res = await signUp(customer(proof));
    assert.equal(res.status, 201);
    assert.equal(res.body.rememberToken, undefined);
    assert.equal(await DeviceSession.countDocuments(), 0);
  });
});
