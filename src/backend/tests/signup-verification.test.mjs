/**
 * Asking for a sign-up code by email, against the real controller.
 *
 * Runs on an in-memory MongoDB and a stubbed email provider, so it touches
 * nothing outside this process:
 *
 *     node --test tests/signup-verification.test.mjs
 *
 * Environment is set before anything is imported on purpose: the email module
 * reads it once, at load.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
process.env.BREVO_API_KEY = 'test-key';
process.env.EMAIL_FROM = 'noreply@example.test';
delete process.env.MONGODB_URI;

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: axios } = await import('axios');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const { sendSignupCode } = await import('../controllers/signupVerificationController.js');
const { default: SignupVerification } = await import('../models/SignupVerification.js');

/** Every message the email provider was asked to carry, newest last. */
let emails = [];
let providerShouldFail = false;
axios.post = async (url, body) => {
  if (providerShouldFail) throw new Error('provider down');
  emails.push({ url, to: body.to?.[0]?.email, subject: body.subject, html: body.htmlContent });
  return { data: { messageId: 'test' } };
};

const app = express();
app.use(express.json());
app.post('/api/signup-verification/send', sendSignupCode);

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_test'));
  await SignupVerification.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  emails = [];
  providerShouldFail = false;
  await SignupVerification.deleteMany({});
});

const askForCode = (email) =>
  request(app)
    .post('/api/signup-verification/send')
    .send({ channel: 'email', value: email, role: 'rider' });

test('an email code is sent and the partner is told so', async () => {
  const response = await askForCode('rider@example.com');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'success');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'rider@example.com');
  assert.match(emails[0].html, /<strong>\d{6}<\/strong>/);
});

test('a provider that turns the message away is not reported as a code sent', async () => {
  providerShouldFail = true;

  const response = await askForCode('rider@example.com');

  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'error');
  assert.equal(response.body.code, 'email_unavailable');
  assert.doesNotMatch(response.body.message, /code sent/i);
  assert.equal(emails.length, 0);
});

test('asking again once the provider is back sends the code', async () => {
  providerShouldFail = true;
  assert.equal((await askForCode('rider@example.com')).status, 503);

  providerShouldFail = false;
  const retry = await askForCode('rider@example.com');

  assert.equal(retry.status, 200);
  assert.equal(emails.length, 1);
});
