/**
 * "Remember this device": what lets a phone that has already proved its number
 * come back without another code, for a little while.
 *
 * The limits are the point of this file, so they are stated once, here:
 *
 *   - It lasts REMEMBER_DEVICE_DAYS (30 by default) from the code that created
 *     it. Using it does not extend it; after that, a code is needed again.
 *   - An account keeps at most MAX_REMEMBERED_DEVICES (3 by default). Remembering
 *     a fourth phone drops the one that has gone longest without being used.
 *   - Signing out of the app revokes it on the server as well as on the phone.
 *
 * Both limits are read when they are used rather than when the file loads, so
 * they can be changed in the environment and tested without re-importing.
 */
import crypto from 'crypto';
import DeviceSession from '../models/DeviceSession.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const rememberDays = () => positiveInt(process.env.REMEMBER_DEVICE_DAYS, 30);
export const maxRememberedDevices = () => positiveInt(process.env.MAX_REMEMBERED_DEVICES, 3);

const hash = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

/** What the app sends as its device id: opaque, but not allowed to be junk. */
export const readDeviceId = (value) => {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
};

/**
 * Remembers this phone for this account and returns the secret to keep on it.
 * Null when the app did not send a usable device id, which simply means the
 * phone is not remembered - signing in still worked.
 */
export const rememberDevice = async ({ userId, role, deviceId }) => {
  const id = readDeviceId(deviceId);
  if (!id) return null;

  const secret = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + rememberDays() * DAY_MS);

  await DeviceSession.findOneAndUpdate(
    { user: userId, deviceId: id },
    {
      user: userId,
      role,
      deviceId: id,
      secretHash: hash(secret),
      lastUsedAt: new Date(now),
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Over the limit: the phones used most recently stay.
  const keep = maxRememberedDevices();
  const surplus = await DeviceSession.find({ user: userId })
    .sort({ lastUsedAt: -1, _id: -1 })
    .skip(keep)
    .select('_id')
    .lean();
  if (surplus.length) {
    await DeviceSession.deleteMany({ _id: { $in: surplus.map((row) => row._id) } });
  }

  return { rememberToken: secret, rememberExpiresAt: expiresAt };
};

/**
 * The session this secret opens, or null. The device id must be the one it was
 * issued to and the date must not have passed. Marks it as used.
 */
export const findRememberedDevice = async ({ deviceId, token }) => {
  const id = readDeviceId(deviceId);
  const secret = String(token ?? '');
  if (!id || secret.length < 20 || secret.length > 200) return null;

  return DeviceSession.findOneAndUpdate(
    { deviceId: id, secretHash: hash(secret), expiresAt: { $gt: new Date() } },
    { lastUsedAt: new Date() },
    { new: true }
  );
};

/** Revokes one remembered phone. Holding its secret is what entitles you to. */
export const forgetDevice = async ({ deviceId, token }) => {
  const id = readDeviceId(deviceId);
  const secret = String(token ?? '');
  if (!id || !secret) return false;
  const gone = await DeviceSession.deleteOne({ deviceId: id, secretHash: hash(secret) });
  return gone.deletedCount > 0;
};

export const dropDeviceSession = (session) => DeviceSession.deleteOne({ _id: session._id });
