/**
 * What Google Play review and a security check will look at, proved against an
 * in-memory database:
 *
 *   - a payment is recorded even when the app never reports it (webhook)
 *   - ID documents are not reachable by a bare link
 *   - a customer, vendor and rider can delete their account
 *   - the reviewer logins work only when switched on, only for listed numbers
 *   - one customer cannot see another customer's order
 *   - only real images/PDFs are accepted as uploads
 *
 *     node --test tests/play-store-readiness.test.mjs
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
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
process.env.RAZORPAY_KEY_ID = 'rzp_test_not_a_real_key';
process.env.RAZORPAY_KEY_SECRET = 'not-a-real-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret-for-tests';
delete process.env.ALLOW_DEBUG_OTP;
delete process.env.MONGODB_URI;
delete process.env.REVIEWER_OTP;
delete process.env.REVIEWER_LOGINS;

const home = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-playstore-test-'));
process.chdir(scratch);

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: axios } = await import('axios');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: orderRoutes } = await import('../routes/orderRoutes.js');
const { default: vendorRoutes } = await import('../routes/vendorRoutes.js');
const { default: riderRoutes } = await import('../routes/riderRoutes.js');
const { default: publicSettingsRoutes } = await import('../routes/publicSettingsRoutes.js');
const { razorpayWebhook } = await import('../controllers/user/razorpayWebhook.js');
const privateFiles = await import('../utils/privateFiles.js');
const { sniffUploadType } = await import('../utils/fileSniff.js');
const { default: User } = await import('../models/User.js');
const { default: Order } = await import('../models/Order.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: WalletTransaction } = await import('../models/WalletTransaction.js');
const { default: Wallet } = await import('../models/Wallet.js');
const { default: AccountDeletionRequest } = await import('../models/AccountDeletionRequest.js');

let sms = [];
axios.post = async (url, body) => {
  sms.push({ url, ...body.recipients[0], template: body.template_id });
  return { data: { type: 'success' } };
};

const uploadsDir = path.join(scratch, 'uploads');
fs.mkdirSync(path.join(uploadsDir, 'rider-documents'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'menu-images'), { recursive: true });
fs.writeFileSync(path.join(uploadsDir, 'rider-documents', 'aadhaar.png'), 'secret');
fs.writeFileSync(path.join(uploadsDir, 'menu-images', 'dish.png'), 'public');

const app = express();
app.post('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), razorpayWebhook);
app.use(express.json());
app.use(privateFiles.stripSignaturesFromRequests);
app.use(privateFiles.signPrivateUrlsInResponses);
app.use('/uploads', privateFiles.guardPrivateUploads, express.static(uploadsDir));
app.get('/api/echo-doc', (req, res) =>
  res.json({ url: '/uploads/rider-documents/aadhaar.png', other: '/uploads/menu-images/dish.png' })
);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/public', publicSettingsRoutes);

const PHONES = {
  alice: '9100000001',
  bob: '9100000002',
  vendor: '9100000003',
  rider: '9100000004',
  reviewer: '9100000009',
  stranger: '9100000010',
};
let mongo;
const tokens = {};
const bearer = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
let restaurant;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_playstore_test'));
  const mk = (name, phone, role, extra = {}) =>
    User.create({
      name, email: `${name.toLowerCase().replace(/\W/g, '')}@example.test`, phone,
      password: 'not-used-anywhere-1A!', role, isVerified: true, ...extra,
    });
  await mk('Alice', PHONES.alice, 'user');
  await mk('Bob', PHONES.bob, 'user');
  const vendor = await mk('Vee', PHONES.vendor, 'vendor');
  await mk('Rhea', PHONES.rider, 'rider', { status: 'active' });
  await mk('Reviewer', PHONES.reviewer, 'user');
  restaurant = await Restaurant.create({
    name: 'Test Kitchen', owner: vendor._id, status: 'approved', isEnabled: true,
    phone: '+919100000003', categories: ['Fast Food'],
    address: { street: 'x', city: 'Lucknow', zipCode: '226001', coordinates: { latitude: 26.91, longitude: 80.94 } },
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  process.chdir(home);
  fs.rmSync(scratch, { recursive: true, force: true });
});

const signIn = async (who, role) => {
  const phone = PHONES[who];
  const asked = await request(app).post('/api/auth/send-otp').send({ phone, role });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const code = sms.at(-1)[process.env.MSG91_OTP_VAR || 'num'];
  const verified = await request(app).post('/api/auth/verify-otp').send({ phone, otp: code, role });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  tokens[who] = verified.body.token;
  return verified.body;
};

const makeOrder = async (user, extra = {}) =>
  Order.create({
    userId: user._id, restaurantId: restaurant._id,
    items: [{ foodItemId: new mongoose.Types.ObjectId(), name: 'Biryani', quantity: 1, price: 200 }],
    subtotal: 200, total: 250, status: 'Payment Pending',
    paymentMethod: 'razorpay', paymentStatus: 'pending',
    deliveryAddress: { street: 'x', city: 'Lucknow', state: 'UP', zipCode: '226001' },
    ...extra,
  });

const signed = (obj, secret = process.env.RAZORPAY_WEBHOOK_SECRET) => {
  const raw = JSON.stringify(obj);
  return { raw, sig: crypto.createHmac('sha256', secret).update(raw).digest('hex') };
};
const capturedEvent = (rzpOrderId, paymentId, paise) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: rzpOrderId, amount: paise } } },
});
const postWebhook = (obj, secret) => {
  const { raw, sig } = signed(obj, secret);
  return request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', sig)
    .send(raw);
};

describe('payments: a paid order is recorded even if the app never says so', () => {
  test('a signed webhook places the order; replaying it changes nothing', async () => {
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice, { razorpayOrderId: 'order_A1' });

    const first = await postWebhook(capturedEvent('order_A1', 'pay_A1', 25000));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.outcome, 'paid');

    const after1 = await Order.findById(order._id);
    assert.equal(after1.paymentStatus, 'paid');
    assert.equal(after1.status, 'Waiting for Confirmation');
    assert.equal(after1.razorpayPaymentId, 'pay_A1');
    const timeline = after1.timeline.length;

    const second = await postWebhook(capturedEvent('order_A1', 'pay_A1', 25000));
    assert.equal(second.body.outcome, 'already_paid');
    assert.equal((await Order.findById(order._id)).timeline.length, timeline, 'no second timeline entry');
  });

  test('an unsigned or wrongly signed call is refused and changes nothing', async () => {
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice, { razorpayOrderId: 'order_A2' });
    const bad = await postWebhook(capturedEvent('order_A2', 'pay_A2', 25000), 'some-other-secret');
    assert.equal(bad.status, 401);
    const none = await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json')
      .send(JSON.stringify(capturedEvent('order_A2', 'pay_A2', 25000)));
    assert.equal(none.status, 401);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
  });

  test('a payment for the wrong amount does not place the order', async () => {
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice, { razorpayOrderId: 'order_A3' });
    const res = await postWebhook(capturedEvent('order_A3', 'pay_A3', 100));
    assert.equal(res.status, 200);
    assert.equal(res.body.ignored, true);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
  });

  test('the app confirming first and the webhook after is still one payment', async () => {
    await signIn('alice', 'user');
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice, { razorpayOrderId: 'order_A4' });
    const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_A4|pay_A4').digest('hex');
    const verified = await request(app)
      .post('/api/orders/razorpay/verify')
      .set(bearer('alice'))
      .send({ razorpay_order_id: 'order_A4', razorpay_payment_id: 'pay_A4', razorpay_signature: sig, orderId: String(order._id) });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const hook = await postWebhook(capturedEvent('order_A4', 'pay_A4', 25000));
    assert.equal(hook.body.outcome, 'already_paid');
    const final = await Order.findById(order._id);
    assert.equal(final.timeline.filter((t) => /Payment verified/.test(t.message)).length, 1);
  });

  test('a wallet top-up reported by the webhook is credited exactly once', async () => {
    const alice = await User.findOne({ phone: PHONES.alice });
    await Wallet.create({ userId: alice._id, balance: 0 });
    await WalletTransaction.create({
      userId: alice._id, type: 'credit', amount: 500, description: 'Added to Wallet',
      category: 'wallet_topup', status: 'pending', balanceBefore: 0, balanceAfter: 0,
      metadata: { razorpayOrderId: 'order_W1' },
    });
    const evt = capturedEvent('order_W1', 'pay_W1', 50000);
    await postWebhook(evt);
    await postWebhook(evt);
    assert.equal((await Wallet.findOne({ userId: alice._id })).balance, 500);
  });
});

describe('documents: a bare link no longer opens an ID document', () => {
  test('unsigned: refused. other folders: still public', async () => {
    assert.equal((await request(app).get('/uploads/rider-documents/aadhaar.png')).status, 403);
    assert.equal((await request(app).get('/uploads/menu-images/dish.png')).status, 200);
  });

  test('signed in callers get a working short-lived link; anonymous callers do not', async () => {
    const anon = await request(app).get('/api/echo-doc');
    assert.equal(anon.body.url, '/uploads/rider-documents/aadhaar.png');

    const withToken = await request(app).get('/api/echo-doc').set('Authorization', 'Bearer anything');
    assert.match(withToken.body.url, /\?exp=\d+&sig=[0-9a-f]{64}$/);
    assert.equal(withToken.body.other, '/uploads/menu-images/dish.png');
    assert.equal((await request(app).get(withToken.body.url)).status, 200);
  });

  test('a tampered or expired link is refused', async () => {
    const link = privateFiles.signPrivateUrl('/uploads/rider-documents/aadhaar.png');
    assert.equal((await request(app).get(link.replace('aadhaar', 'other'))).status, 403);
    const expired = privateFiles.signPrivateUrl('/uploads/rider-documents/aadhaar.png', -10);
    assert.equal((await request(app).get(expired)).status, 403);
    assert.equal((await request(app).get('/uploads/rider-documents/..%2f..%2fpackage.json')).status, 400);
  });
});

describe('uploads: only real images and PDFs', () => {
  test('magic bytes decide, not the file name', () => {
    assert.equal(sniffUploadType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'image/jpeg');
    assert.equal(sniffUploadType(Buffer.from('%PDF-1.7 ...')), 'application/pdf');
    assert.equal(sniffUploadType(Buffer.from('\x89PNG\r\n\x1a\n....', 'latin1')), 'image/png');
    assert.equal(sniffUploadType(Buffer.from('<html><script>alert(1)</script>')), null);
    assert.equal(sniffUploadType(Buffer.from('MZ\x90\x00 an exe')), null);
  });
});

describe('reviewer logins', () => {
  test('off by default: a reviewer number gets a normal SMS and no fixed code', async () => {
    const before = sms.length;
    await request(app).post('/api/auth/send-otp').send({ phone: PHONES.reviewer, role: 'user' });
    assert.equal(sms.length, before + 1);
    const guess = await request(app).post('/api/auth/verify-otp').send({ phone: PHONES.reviewer, otp: '246810', role: 'user' });
    assert.equal(guess.status, 400);
  });

  test('on: the listed number signs in with the fixed code and no SMS; others are untouched', async () => {
    await mongoose.connection.collection('loginotps').deleteMany({});
    process.env.REVIEWER_OTP = '246810';
    process.env.REVIEWER_LOGINS = `user:${PHONES.reviewer}`;
    try {
      const before = sms.length;
      const asked = await request(app).post('/api/auth/send-otp').send({ phone: PHONES.reviewer, role: 'user' });
      assert.equal(asked.status, 200);
      assert.equal(sms.length, before, 'no SMS is sent for the reviewer number');
      const ok = await request(app).post('/api/auth/verify-otp').send({ phone: PHONES.reviewer, otp: '246810', role: 'user' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.ok(ok.body.token);

      // Another number, same code: refused.
      await request(app).post('/api/auth/send-otp').send({ phone: PHONES.stranger, role: 'user' });
      const no = await request(app).post('/api/auth/verify-otp').send({ phone: PHONES.stranger, otp: '246810', role: 'user' });
      assert.equal(no.status, 400);

      // The listed number in a role it is not listed for: refused.
      await request(app).post('/api/auth/send-otp').send({ phone: PHONES.reviewer, role: 'vendor' });
      const wrongRole = await request(app).post('/api/auth/verify-otp').send({ phone: PHONES.reviewer, otp: '246810', role: 'vendor' });
      assert.notEqual(wrongRole.status, 200);
    } finally {
      delete process.env.REVIEWER_OTP;
      delete process.env.REVIEWER_LOGINS;
    }
  });
});

describe('one customer cannot read another customer\'s order', () => {
  test("Bob is refused Alice's order, tracking, delivery code, chat and invoice", async () => {
    await signIn('alice', 'user');
    await signIn('bob', 'user');
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice, { status: 'Processing', paymentMethod: 'cod', paymentStatus: 'pending' });
    const id = String(order._id);

    for (const url of [
      `/api/orders/${id}/tracking`,
      `/api/orders/${id}/delivery-code`,
      `/api/orders/${id}/chat`,
      `/api/orders/${id}/invoice`,
      `/api/orders/${id}/invoice-link`,
    ]) {
      const asBob = await request(app).get(url).set(bearer('bob'));
      assert.ok([403, 404].includes(asBob.status), `${url} gave Bob ${asBob.status}`);
      assert.doesNotMatch(JSON.stringify(asBob.body), /Biryani|Alice/);
    }

    const mine = await request(app).get('/api/orders/my-orders').set(bearer('bob'));
    assert.equal(mine.status, 200);
    assert.doesNotMatch(JSON.stringify(mine.body), new RegExp(id));

    const cancel = await request(app).patch(`/api/orders/${id}/status`).set(bearer('bob')).send({ status: 'Cancelled' });
    assert.ok([403, 404].includes(cancel.status), `cancel gave ${cancel.status}`);
    assert.notEqual((await Order.findById(id)).status, 'Cancelled');
  });

  test("Bob cannot pay for Alice's order", async () => {
    const alice = await User.findOne({ phone: PHONES.alice });
    const order = await makeOrder(alice);
    const res = await request(app).post('/api/orders/razorpay/create-order').set(bearer('bob')).send({ orderId: String(order._id) });
    assert.ok([403, 404, 503].includes(res.status));
  });
});

describe('deleting an account', () => {
  test('refused without the confirmation word', async () => {
    await signIn('bob', 'user');
    const res = await request(app).post('/api/auth/delete-account').set(bearer('bob')).send({});
    assert.equal(res.status, 400);
  });

  test('refused while an order is in progress, allowed after', async () => {
    const bob = await User.findOne({ phone: PHONES.bob });
    const live = await makeOrder(bob, { status: 'Processing', paymentMethod: 'cod' });
    const blocked = await request(app).post('/api/auth/delete-account').set(bearer('bob')).send({ confirm: 'DELETE' });
    assert.equal(blocked.status, 409);
    await Order.updateOne({ _id: live._id }, { status: 'Delivered' });

    const done = await request(app).post('/api/auth/delete-account').set(bearer('bob')).send({ confirm: 'DELETE' });
    assert.equal(done.status, 200, JSON.stringify(done.body));

    const record = await User.findById(bob._id);
    assert.equal(record.name, 'Deleted user');
    assert.ok(record.deletedAt);
    assert.notEqual(record.phone, PHONES.bob);
    assert.doesNotMatch(String(record.email), /bob/i);
    // The order history is still there.
    assert.equal(await Order.countDocuments({ userId: bob._id }), 1);
  });

  test('the old token stops working, and the number can sign up again as new', async () => {
    const me = await request(app).get('/api/orders/my-orders').set(bearer('bob'));
    assert.equal(me.status, 401);
    await request(app).post('/api/auth/send-otp').send({ phone: PHONES.bob, role: 'user' });
    const code = sms.at(-1)[process.env.MSG91_OTP_VAR || 'num'];
    const verified = await request(app).post('/api/auth/verify-otp').send({ phone: PHONES.bob, otp: code, role: 'user' });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.isNewUser, true);
  });

  test('a restaurant owner is switched off when they delete', async () => {
    await signIn('vendor', 'vendor');
    const blocked = await request(app).post('/api/auth/delete-account').set(bearer('vendor')).send({ confirm: 'DELETE' });
    assert.equal(blocked.status, 409, 'orders still in progress at the restaurant');
    await Order.updateMany({ restaurantId: restaurant._id }, { status: 'Delivered' });
    const res = await request(app).post('/api/auth/delete-account').set(bearer('vendor')).send({ confirm: 'DELETE' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await Restaurant.findById(restaurant._id);
    assert.equal(r.isEnabled, false);
    assert.equal(r.isOpen, false);
  });

  test('a delivery partner can delete', async () => {
    await signIn('rider', 'rider');
    const res = await request(app).post('/api/auth/delete-account').set(bearer('rider')).send({ confirm: 'DELETE' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test('the website form records a request', async () => {
    const res = await request(app)
      .post('/api/public/account-deletion-request')
      .send({ phone: '+91 98765 43210', role: 'rider', reason: 'no longer riding' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const saved = await AccountDeletionRequest.findOne({ phone: '+919876543210' });
    assert.equal(saved.role, 'rider');
    const bad = await request(app).post('/api/public/account-deletion-request').send({ phone: '123' });
    assert.equal(bad.status, 400);
  });
});
