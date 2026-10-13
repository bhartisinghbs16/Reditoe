/**
 * The posters the customer app is sent: only ones whose picture can still be
 * fetched. Runs on an in-memory MongoDB and a scratch working directory.
 *
 *     node --test tests/public-banners.test.mjs
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
delete process.env.MONGODB_URI;
delete process.env.PUBLIC_API_URL;

// Uploads are looked up under the working directory, so give it a throwaway one.
const home = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reditoe-banner-test-'));
process.chdir(scratch);
fs.mkdirSync(path.join(scratch, 'uploads', 'banners'), { recursive: true });
fs.writeFileSync(path.join(scratch, 'uploads', 'banners', 'present.png'), 'x');

const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { getPublicBanners, posterImageExists } = await import('../controllers/user/bannerController.js');
const { default: Banner } = await import('../models/Banner.js');

const app = express();
app.get('/api/banners', getPublicBanners);

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('reditoe_banner_test'));
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  process.chdir(home);
  fs.rmSync(scratch, { recursive: true, force: true });
});

const poster = (title, mediaUrl, order) =>
  Banner.create({
    title,
    bannerType: 'image',
    mediaUrl,
    mediaType: 'image',
    position: 'homepage',
    displayOrder: order,
    createdBy: new mongoose.Types.ObjectId(),
  });

describe('posterImageExists', () => {
  const req = { get: (name) => (name === 'host' ? 'api.example.test' : undefined) };

  test('a file kept on this server counts only while it is there', () => {
    assert.equal(posterImageExists('/uploads/banners/present.png', req), true);
    assert.equal(posterImageExists('/uploads/banners/gone.png', req), false);
    assert.equal(posterImageExists('uploads/banners/gone.png', req), false);
    assert.equal(posterImageExists('https://api.example.test/uploads/banners/present.png', req), true);
    assert.equal(posterImageExists('https://api.example.test/uploads/banners/gone.png', req), false);
    assert.equal(posterImageExists('http://localhost:5000/uploads/banners/gone.png', req), false);
    assert.equal(
      posterImageExists('https://some-service.up.railway.app/uploads/banners/gone.png', req),
      false
    );
  });

  test('anything stored elsewhere is passed through, not checked', () => {
    assert.equal(posterImageExists('https://cdn.example.com/uploads/banners/gone.png', req), true);
    assert.equal(posterImageExists('https://bucket.s3.amazonaws.com/banners/a.png', req), true);
    assert.equal(posterImageExists('//cdn.example.com/a.png', req), true);
    assert.equal(posterImageExists('data:image/png;base64,AAAA', req), true);
  });

  test('an empty address, or one that climbs out of the uploads folder, is not shown', () => {
    assert.equal(posterImageExists('', req), false);
    assert.equal(posterImageExists(undefined, req), false);
    assert.equal(posterImageExists('/uploads/../package.json', req), false);
    assert.equal(posterImageExists('/uploads/%2e%2e/package.json', req), false);
  });
});

describe('GET /api/banners', () => {
  test('leaves out posters whose picture is gone, and keeps the rest in order', async () => {
    await poster('Gone', '/uploads/banners/gone.png', 1);
    await poster('Kept local', '/uploads/banners/present.png', 2);
    await poster('Kept cloud', 'https://cdn.example.com/banners/b.png', 3);

    const res = await request(app).get('/api/banners?position=homepage');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.banners.map((banner) => banner.title),
      ['Kept local', 'Kept cloud']
    );
  });

  test('when every picture is gone the answer is an empty list, not an error', async () => {
    await Banner.deleteMany({});
    await poster('Gone', '/uploads/banners/gone.png', 1);

    const res = await request(app).get('/api/banners?position=homepage');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.banners, []);
  });
});
