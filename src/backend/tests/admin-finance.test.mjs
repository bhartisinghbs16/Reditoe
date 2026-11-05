/**
 * The console's Finance screens and Users & roles, through the real admin
 * router.
 *
 *     node --test tests/admin-finance.test.mjs
 *
 * Each list is asked for the way the console asks and must answer in the
 * shape the console reads: paging at the top level, and the fields the pages
 * display (amounts, dates, references, restaurant names). A role-scoped admin
 * with finance access must get into Invoices; one without must not.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
process.env.RAZORPAY_KEY_ID = 'rzp_test_not_a_real_key';
process.env.RAZORPAY_KEY_SECRET = 'not-a-real-secret';
delete process.env.MONGODB_URI;

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-finance-test-')));

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { seedTestRestaurant, TEST_OUTLET_ID } = await import('../scripts/seed-test-restaurant.mjs');
const { default: adminRoutes } = await import('../routes/admin/index.js');
const { signToken } = await import('../utils/jwt.js');
const { default: User } = await import('../models/User.js');
const { default: Role } = await import('../models/Role.js');
const { default: Restaurant } = await import('../models/Restaurant.js');
const { default: Order } = await import('../models/Order.js');
const { default: FoodItem } = await import('../models/FoodItem.js');
const { default: Payout } = await import('../models/Payout.js');
const { default: Invoice } = await import('../models/Invoice.js');
const { default: VendorSettlement } = await import('../models/VendorSettlement.js');
const { default: FinancialTransaction } = await import('../models/FinancialTransaction.js');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

let mongo;
let restaurant;
let order;
let customer;
let vendor;
const tok = {};
const get = (url, who = 'admin') =>
  request(app).get(`/api/admin${url}`).set('Authorization', `Bearer ${tok[who]}`);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_finance_test'));
  const mk = (name, phone, role, extra = {}) =>
    User.create({
      name, email: `${role}${phone}@example.test`, phone, password: 'not-used-anywhere-1A!',
      role, isVerified: true, ...extra,
    });
  const admin = await mk('Test Admin', '9200000000', 'admin');
  customer = await mk('Test Customer', '9222222222', 'user');
  vendor = await mk('Test Vendor', '9211111111', 'vendor');

  const financeRole = await Role.create({
    name: 'finance_team', displayName: 'Finance team', level: 3,
    permissions: [{ resource: 'financial', actions: ['read'] }],
  });
  const supportRole = await Role.create({
    name: 'support_team', displayName: 'Support team', level: 4,
    permissions: [{ resource: 'orders', actions: ['read'] }],
  });
  const finance = await mk('Finance Person', '9200000001', 'admin', { rbacRole: financeRole._id });
  const support = await mk('Support Person', '9200000002', 'admin', { rbacRole: supportRole._id });
  Object.assign(tok, {
    admin: signToken(admin._id),
    finance: signToken(finance._id),
    support: signToken(support._id),
  });

  await seedTestRestaurant(
    { latitude: 26.91, longitude: 80.942, vendor: '9211111111', customer: '9222222222' },
    { apply: true }
  );
  restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });
  await restaurant.updateOne({ commissionPercent: 15 });

  const food = await FoodItem.findOne({ restaurantId: restaurant._id });
  order = await Order.create({
    userId: customer._id, restaurantId: restaurant._id, status: 'Delivered',
    items: [{ foodItemId: food._id, name: 'Biriyani', quantity: 2, price: 100 }],
    subtotal: 200, total: 240, paymentMethod: 'cod',
    deliveryAddress: { street: 'Sitapur Road', city: 'Lucknow', state: 'Uttar Pradesh', zipCode: '226021' },
  });

  await FinancialTransaction.create({
    type: 'order_payment', orderId: order._id, restaurantId: restaurant._id,
    amount: 240, commissionAmount: 30, vendorAmount: 170, paymentMethod: 'online',
    status: 'completed', transactionId: 'TXN-1',
  });
  await Payout.create({
    restaurantId: restaurant._id, orderIds: [order._id], grossAmount: 200,
    commissionAmount: 30, netAmount: 170, status: 'completed', transactionId: 'UTR-77',
  });
  await Invoice.create({
    invoiceNumber: 'INV-1', orderId: order._id, customerId: customer._id, vendorId: vendor._id,
    subtotal: 200, taxAmount: 10, deliveryFee: 30, discountAmount: 0, platformFee: 8, grandTotal: 248,
    paymentMethod: 'cash', status: 'paid', issueDate: new Date('2026-10-01'), dueDate: new Date('2026-10-08'),
    lineItems: [{ name: 'Biriyani', quantity: 2, unitPrice: 100, totalPrice: 200 }],
    billingAddress: { street: 'Sitapur Road', city: 'Lucknow', state: 'UP', zipCode: '226021' },
  });
  await VendorSettlement.create({
    settlementNumber: 'SET-1', vendorId: vendor._id, restaurantId: restaurant._id,
    settlementPeriod: { startDate: new Date('2026-10-01'), endDate: new Date('2026-10-07') },
    status: 'paid', items: [],
    summary: {
      totalOrders: 1, grossRevenue: 200, totalCommission: 30, totalGST: 5, totalPlatformFee: 8,
      netPayable: 157, finalAmount: 155,
    },
    bankDetails: { accountHolderName: 'Vendor', accountNumber: '1234567890', bankName: 'Test Bank', ifsc: 'TEST0000001' },
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('transactions list in the console shape', async () => {
  const res = await get('/payments?page=1&limit=10');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  const [row] = res.body.data.payments;
  assert.equal(row.amount, 240);
  assert.equal(row.method, 'online');
  assert.equal(row.orderId.orderNumber != null, true);
});

test('transactions filter by the values the console sends', async () => {
  for (const [query, expected] of [
    ['status=completed', 1],
    ['status=Paid', 1],
    ['status=failed', 0],
    ['method=Online', 1],
    ['method=COD', 0],
    ['type=payment', 1],
    ['type=refund', 0],
  ]) {
    const res = await get(`/payments?${query}`);
    assert.equal(res.status, 200, query);
    assert.equal(res.body.total, expected, query);
  }
});

test('settlements carry paging, dates, amounts and the restaurant', async () => {
  const res = await get('/vendor-settlements?page=1&limit=10');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.totalPages, 1);
  const [row] = res.body.data.settlements;
  assert.equal(row.amount, 200);
  assert.equal(row.netAmount, 155);
  assert.equal(row.reference, 'SET-1');
  assert.ok(row.periodStart && row.periodEnd);
  assert.equal(row.restaurantId.name, restaurant.name);
});

test('settlements filter by "settled" and search by restaurant', async () => {
  assert.equal((await get('/vendor-settlements?status=settled')).body.total, 1);
  assert.equal((await get('/vendor-settlements?status=pending')).body.total, 0);
  assert.equal((await get(`/vendor-settlements?search=${encodeURIComponent(restaurant.name.slice(0, 4))}`)).body.total, 1);
  assert.equal((await get('/vendor-settlements?search=zzzz-nothing')).body.total, 0);
});

test('payouts carry gross, reference and method', async () => {
  const res = await get('/payouts?page=1&limit=10');
  assert.equal(res.status, 200);
  const [row] = res.body.data.payouts;
  assert.equal(row.amount, 200);
  assert.equal(row.netAmount, 170);
  assert.equal(row.reference, 'UTR-77');
  assert.equal(row.method, 'manual');
  assert.equal(row.restaurantId.name, restaurant.name);
  assert.equal((await get('/payouts?status=paid')).body.total, 1);
  assert.equal((await get('/payouts?search=UTR-77')).body.total, 1);
  assert.equal((await get('/payouts?search=nope')).body.total, 0);
});

test('invoices carry paging, amount, issue date and restaurant', async () => {
  const res = await get('/invoices?page=1&limit=10');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  const [row] = res.body.data.invoices;
  assert.equal(row.totalAmount, 248);
  assert.ok(row.issuedDate);
  assert.equal(row.restaurantId.name, restaurant.name);
  assert.equal(row.orderId.orderNumber != null, true);
});

test('commission & fees: restaurants carry what they have sold', async () => {
  const res = await get('/restaurants?page=1&limit=25');
  assert.equal(res.status, 200);
  const row = res.body.data.restaurants.find((r) => String(r._id) === String(restaurant._id));
  assert.equal(row.totalOrders, 1);
  assert.equal(row.totalRevenue, 200);
  assert.equal(row.commissionPercent, 15);
});

test('roles list counts the people holding each role', async () => {
  const res = await get('/rbac/roles');
  assert.equal(res.status, 200);
  const finance = res.body.data.roles.find((r) => r.name === 'finance_team');
  assert.equal(finance.userCount, 1);
});

test('admin users lists admins only, not customers or vendors', async () => {
  const res = await get('/rbac/users');
  assert.equal(res.status, 200);
  const emails = res.body.data.users.map((u) => u.email);
  assert.ok(emails.includes('admin9200000000@example.test'));
  assert.ok(!emails.includes('user9222222222@example.test'));
  assert.ok(!emails.includes('vendor9211111111@example.test'));
});

test('a finance role reaches Invoices, a support role does not', async () => {
  assert.equal((await get('/invoices', 'finance')).status, 200);
  assert.equal((await get('/invoices/statistics', 'finance')).status, 200);
  assert.equal((await get('/invoices', 'support')).status, 403);
});

test('updating an admin user without isActive does not block them', async () => {
  const finance = await User.findOne({ email: 'admin9200000001@example.test' });
  const role = await Role.findOne({ name: 'finance_team' });
  const res = await request(app)
    .put(`/api/admin/rbac/users/${finance._id}`)
    .set('Authorization', `Bearer ${tok.admin}`)
    .send({ roleId: String(role._id) });
  assert.equal(res.status, 200);
  const after = await User.findById(finance._id);
  assert.equal(after.isBlocked, false);
  assert.equal(after.name, 'Finance Person');
});

test('an admin can create a role with permissions, then a user holding it', async () => {
  const made = await request(app)
    .post('/api/admin/rbac/roles')
    .set('Authorization', `Bearer ${tok.admin}`)
    .send({
      name: 'refund_team', displayName: 'Refund team', level: 5,
      permissions: [{ resource: 'orders', actions: ['read', 'update'] }],
    });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const roleId = made.body.data.role._id;

  const user = await request(app)
    .post('/api/admin/rbac/users')
    .set('Authorization', `Bearer ${tok.admin}`)
    .send({ name: 'New Person', email: 'new.person@example.test', password: 'Sturdy-pass-1A!', roleId });
  assert.equal(user.status, 201, JSON.stringify(user.body));
  assert.equal(user.body.data.user.rbacRole.name, 'refund_team');
});
