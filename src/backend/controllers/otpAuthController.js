/**
 * Signing in by mobile number and one-time code.
 *
 * This is the only way into the customer, vendor and delivery-partner apps.
 * There is no password: a person types their mobile number, proves they hold it
 * with a code sent there, and then one of two things is true -
 *
 *   - an account already has that number, and they are signed in; or
 *   - nobody does, and they are handed a proof that the number is theirs, which
 *     the sign-up screen for that app trades for an account.
 *
 * The same two endpoints serve all three apps. The app says which one it is
 * with `role`, and a number registered under one role is not let into another.
 *
 * Everything that makes a six-digit code safe lives here and nowhere else: it
 * is generated from the system's random source, stored hashed, expires, can be
 * asked for only so often, and can be guessed at only a handful of times. The
 * API-wide rate limiter deliberately skips /auth, so none of that is
 * optional - without it these endpoints would be a free text-message cannon and
 * a million-to-one lottery for anybody's account.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import LoginOtp from '../models/LoginOtp.js';
import { readIdentifier, identifierQuery } from '../utils/identifier.js';
import { signToken } from '../utils/jwt.js';
import { sendSms } from '../services/smsService.js';
import { getKycDisplayStatus } from '../utils/kycStatus.js';
import { issueVerifiedProof } from './signupVerificationController.js';
import {
  rememberDevice,
  findRememberedDevice,
  forgetDevice,
  dropDeviceSession,
} from '../services/deviceSessionService.js';

/** The apps that sign in this way. */
export const OTP_ROLES = ['user', 'vendor', 'rider'];

/** How long a code is good for. */
export const CODE_TTL_MS = 5 * 60 * 1000;
/** How soon another can be asked for. */
export const RESEND_COOLDOWN_MS = 30 * 1000;
/** Codes one number may be sent in a window, whoever is asking. */
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MS = 60 * 60 * 1000;
/** Wrong guesses against one code before it must be replaced. */
export const MAX_ATTEMPTS = 5;

/**
 * Six digits from the system's generator.
 *
 * Not Math.random: these decide whether somebody is let into an account, so
 * they must not be predictable from the time one was issued.
 */
const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Whether the code may be handed back in the response instead of being texted.
 *
 * Only off a production server, or when somebody has deliberately said so.
 * The old check read the Host and X-Forwarded-Host headers, which the caller
 * writes - sending `X-Forwarded-Host: localhost` to a production server was
 * enough to be given anybody's code.
 */
const mayRevealCode = () =>
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEBUG_OTP === 'true';

const roleOf = (value) => {
  const role = String(value ?? 'user').toLowerCase().trim();
  return OTP_ROLES.includes(role) ? role : null;
};

/** What the customer, vendor and partner apps are called when refusing one. */
const ACCOUNT_NAME = {
  user: 'a customer account',
  vendor: 'a vendor account',
  rider: 'a delivery partner account',
};
const APP_NAME = {
  user: 'Reditoe',
  vendor: 'Reditoe Vendor',
  rider: 'Reditoe Delivery Partner',
};

/**
 * Reads the mobile number out of a request.
 *
 * `phone` is the field; `emailOrPhone` is what the apps sent while the same
 * endpoints took either, and is still read so an older build gets a clear
 * answer rather than a missing-field error. An email address is refused by
 * name: it used to work, and "that does not look right" would send somebody
 * hunting for a typo that is not there.
 */
const readPhone = (body) => {
  const typed = body?.phone ?? body?.mobile ?? body?.emailOrPhone;
  if (typed !== undefined && String(typed).includes('@')) {
    return {
      error: 'Email sign-in is no longer available. Use your mobile number.',
    };
  }
  const identifier = readIdentifier(typed);
  if (identifier.kind !== 'phone') {
    return {
      error:
        identifier.reason && !/email/i.test(identifier.reason)
          ? identifier.reason
          : 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.',
    };
  }
  return { identifier };
};

const maskedPhone = (phone) => `+91 ${'X'.repeat(5)}${String(phone).slice(-5)}`;

/**
 * POST /auth/send-otp  { phone, role }
 *
 * Answers the same way whether or not the number has an account: whether it
 * does is for the person who proves they hold it to find out, not for whoever
 * is typing numbers into a box.
 */
export const sendOtp = async (req, res) => {
  try {
    const role = roleOf(req.body?.role);
    if (!role) {
      return res.status(400).json({
        status: 'error',
        success: false,
        message: 'That account type cannot sign in here.',
      });
    }

    const { identifier, error } = readPhone(req.body);
    if (error) {
      return res.status(400).json({ status: 'error', success: false, message: error });
    }
    const phone = identifier.value;
    const now = Date.now();

    const existing = await LoginOtp.findOne({ phone });

    if (existing) {
      const wait = existing.sentAt.getTime() + RESEND_COOLDOWN_MS - now;
      if (wait > 0) {
        const seconds = Math.ceil(wait / 1000);
        return res.status(429).json({
          status: 'error',
          success: false,
          code: 'otp_too_soon',
          retryAfterSeconds: seconds,
          message: `A code was just sent. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
        });
      }

      const windowOpen = existing.windowStartedAt.getTime() + SEND_WINDOW_MS > now;
      if (windowOpen && existing.sendsInWindow >= MAX_SENDS_PER_WINDOW) {
        const minutes = Math.ceil(
          (existing.windowStartedAt.getTime() + SEND_WINDOW_MS - now) / 60000
        );
        return res.status(429).json({
          status: 'error',
          success: false,
          code: 'otp_limit',
          retryAfterSeconds: minutes * 60,
          message: `Too many codes have been sent to this number. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        });
      }
    }

    const code = sixDigits();
    const startsNewWindow =
      !existing || existing.windowStartedAt.getTime() + SEND_WINDOW_MS <= now;
    const windowStartedAt = startsNewWindow ? new Date(now) : existing.windowStartedAt;

    await LoginOtp.findOneAndUpdate(
      { phone },
      {
        phone,
        role,
        codeHash: await bcrypt.hash(code, 10),
        attempts: 0,
        sentAt: new Date(now),
        codeExpiresAt: new Date(now + CODE_TTL_MS),
        windowStartedAt,
        sendsInWindow: startsNewWindow ? 1 : existing.sendsInWindow + 1,
        expiresAt: new Date(windowStartedAt.getTime() + SEND_WINDOW_MS + CODE_TTL_MS),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const delivered = await sendSms({
      to: phone,
      otp: code,
      role,
      message: `${code} is your ${APP_NAME[role]} verification code. It is valid for ${CODE_TTL_MS / 60000} minutes. Do not share it with anyone.`,
    });

    if (!delivered && !mayRevealCode()) {
      // The row stays: the attempt counts against the number's hourly limit,
      // which is what stops a broken provider turning into a retry storm.
      return res.status(503).json({
        status: 'error',
        success: false,
        code: 'sms_unavailable',
        message: "We couldn't send the code right now. Please try again in a moment.",
      });
    }

    if (!delivered) {
      console.warn(`[auth] No SMS delivered - sign-in code for ${phone} is ${code}`);
    }

    return res.status(200).json({
      status: 'success',
      success: true,
      message: delivered
        ? `We sent a 6-digit code to ${maskedPhone(phone)}.`
        : 'Messaging is not configured on this server, so the code is shown here instead.',
      data: {
        phone,
        expiresInSeconds: CODE_TTL_MS / 1000,
        resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
      },
      ...(!delivered ? { devOtp: code } : {}),
    });
  } catch (error) {
    /**
     * Two requests for the same number landed together - a double tap - and both
     * went to create its row. The database let one through and stopped the
     * other. That is the cooldown doing its job a few milliseconds early, and is
     * answered as such rather than as a server fault.
     */
    if (error?.code === 11000) {
      return res.status(429).json({
        status: 'error',
        success: false,
        code: 'otp_too_soon',
        retryAfterSeconds: RESEND_COOLDOWN_MS / 1000,
        message: 'A code was just sent. Try again in a few seconds.',
      });
    }

    console.error('[auth] send-otp failed:', error);
    return res.status(500).json({
      status: 'error',
      success: false,
      message: 'Something went wrong sending the code. Please try again.',
    });
  }
};

/** The account as the apps want to read it after signing in. */
export const accountPayload = (user) => {
  const payload = {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isProfileComplete: !!user.isProfileComplete,
    walletBalance: user.walletBalance,
    savedAddresses: user.savedAddresses,
    avatar: user.profilePhoto || user.avatar || '',
    codEnabled: user.codEnabled === true,
  };

  if (user.role === 'rider') {
    Object.assign(payload, {
      riderId: user.riderId,
      vehicleType: user.vehicleType,
      vehicleName: user.vehicleName,
      vehicleNumber: user.vehicleNumber,
      vehicleBrand: user.vehicleBrand || '',
      vehicleModel: user.vehicleModel || '',
      currentRating: user.currentRating,
      isOnline: user.isOnline,
      bankDetails: user.bankDetails,
      kycStatus: user.kycStatus || 'pending',
      kycDisplayStatus: getKycDisplayStatus(user.kycStatus),
    });
  }

  return payload;
};

/**
 * POST /auth/verify-otp  { phone, otp, role }
 *
 * Success is one of two shapes, told apart by `isNewUser`:
 *
 *   { isNewUser: false, token, data: { user } }          signed in
 *   { isNewUser: true, phone, phoneProof }               go and sign up
 *
 * The proof is the same kind the vendor and partner sign-up have always asked
 * for, issued by the same table, so registration checks it the way it already
 * checks every other verified contact: the app is never taken at its word that
 * a number was verified.
 */
export const verifyOtp = async (req, res) => {
  try {
    const role = roleOf(req.body?.role ?? req.body?.selectedRole);
    if (!role) {
      return res.status(400).json({
        status: 'error',
        success: false,
        message: 'That account type cannot sign in here.',
      });
    }

    const { identifier, error } = readPhone(req.body);
    if (error) {
      return res.status(400).json({ status: 'error', success: false, message: error });
    }
    const phone = identifier.value;

    const code = String(req.body?.otp ?? '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        status: 'error',
        success: false,
        message: 'Enter the 6-digit code we sent you.',
      });
    }

    const record = await LoginOtp.findOne({ phone }).select('+codeHash');
    if (!record || record.codeExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'otp_expired',
        message: 'That code has expired or was never sent. Ask for a new one.',
      });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        status: 'error',
        success: false,
        code: 'otp_attempts',
        message: 'Too many incorrect codes. Ask for a new one.',
      });
    }

    /**
     * Counted before it is compared, in one atomic step.
     *
     * Reading the count, comparing, then writing it back left a window in which
     * a burst of parallel guesses all saw "attempts: 0" and each got its turn -
     * the limit held for one request at a time and not for a thousand at once.
     * Taking the attempt first means the burst runs out of attempts, not the
     * server out of patience.
     */
    const claimed = await LoginOtp.findOneAndUpdate(
      { _id: record._id, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!claimed) {
      return res.status(429).json({
        status: 'error',
        success: false,
        code: 'otp_attempts',
        message: 'Too many incorrect codes. Ask for a new one.',
      });
    }

    // A code asked for on one app does not open another. Answered exactly like
    // a wrong code, so it cannot be used to learn which app a number is on.
    const matches = record.role === role && (await bcrypt.compare(code, record.codeHash));
    if (!matches) {
      const left = Math.max(0, MAX_ATTEMPTS - claimed.attempts);
      return res.status(400).json({
        status: 'error',
        success: false,
        code: 'otp_wrong',
        message:
          left > 0
            ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'Too many incorrect codes. Ask for a new one.',
      });
    }

    // Spent. Only a row that still holds *this* code is removed, so a fresh
    // code asked for while this request was running is not thrown away.
    await LoginOtp.deleteOne({ _id: record._id, codeHash: record.codeHash });

    const holders = await User.find(identifierQuery(identifier)).sort({ createdAt: 1 }).limit(5);
    // Numbers saved twice before creation started refusing that: the account
    // for the app being opened is the one meant.
    const user = holders.find((entry) => (entry.role || 'user') === role) ?? holders[0];

    if (!user) {
      const phoneProof = await issueVerifiedProof('phone', phone);
      return res.status(200).json({
        status: 'success',
        success: true,
        isNewUser: true,
        signupRequired: true,
        role,
        phone,
        phoneProof,
        message: 'Number verified. Complete your sign up to continue.',
        data: { isNewUser: true, phone, phoneProof },
      });
    }

    const accountRole = user.role || 'user';
    if (accountRole !== role) {
      return res.status(403).json({
        status: 'error',
        success: false,
        code: 'wrong_app',
        message: `This number belongs to ${ACCOUNT_NAME[accountRole] || `a ${accountRole} account`}. Please sign in on the ${APP_NAME[accountRole] || accountRole} app instead.`,
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        status: 'error',
        success: false,
        message: 'This account has been suspended. Contact support.',
      });
    }

    /*
     * Remember this phone, if the app asked to. A failure here must not undo a
     * sign-in that has already been proved - the phone just is not remembered.
     */
    const remembered = await rememberDevice({
      userId: user._id,
      role,
      deviceId: req.body?.deviceId,
    }).catch((error) => {
      console.error('[auth] could not remember device:', error.message);
      return null;
    });

    const account = accountPayload(user);
    return res.status(200).json({
      status: 'success',
      success: true,
      isNewUser: false,
      token: signToken(user._id),
      user: account,
      data: { user: account, isNewUser: false },
      ...(remembered ?? {}),
    });
  } catch (error) {
    console.error('[auth] verify-otp failed:', error);
    return res.status(500).json({
      status: 'error',
      success: false,
      message: 'Something went wrong checking the code. Please try again.',
    });
  }
};

/**
 * POST /auth/remember-login  { deviceId, rememberToken, role, phone? }
 *
 * Signs a phone back in without a code, if it is one that was signed in with a
 * code recently enough and has not been signed out. Every way of not qualifying
 * - unknown, expired, revoked, evicted, wrong app, suspended account - gets the
 * same answer, so it cannot be used to learn which of them it was.
 */
export const rememberLogin = async (req, res) => {
  const refuse = () =>
    res.status(401).json({
      status: 'error',
      success: false,
      code: 'remember_invalid',
      message: 'Please sign in with a code.',
    });

  try {
    const role = roleOf(req.body?.role);
    if (!role) return refuse();

    const session = await findRememberedDevice({
      deviceId: req.body?.deviceId,
      token: req.body?.rememberToken,
    });
    if (!session || session.role !== role) return refuse();

    const user = await User.findById(session.user);
    if (!user || user.isBlocked || (user.role || 'user') !== role) {
      await dropDeviceSession(session);
      return refuse();
    }

    // When the app says which number is being signed in, it has to be this
    // account's: a phone remembered for one number does not open another.
    if (req.body?.phone !== undefined && req.body?.phone !== null && req.body?.phone !== '') {
      const { identifier, error } = readPhone(req.body);
      if (error) return refuse();
      const sameNumber = await User.exists({ $and: [{ _id: user._id }, identifierQuery(identifier)] });
      if (!sameNumber) return refuse();
    }

    const account = accountPayload(user);
    return res.status(200).json({
      status: 'success',
      success: true,
      isNewUser: false,
      token: signToken(user._id),
      user: account,
      data: { user: account, isNewUser: false },
      rememberExpiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('[auth] remember-login failed:', error);
    return res.status(500).json({
      status: 'error',
      success: false,
      message: 'Something went wrong signing you in. Please try again.',
    });
  }
};

/**
 * POST /auth/forget-device  { deviceId, rememberToken }
 *
 * Signing out. Always answers the same, so it says nothing about whether the
 * secret was good.
 */
export const forgetThisDevice = async (req, res) => {
  try {
    await forgetDevice({ deviceId: req.body?.deviceId, token: req.body?.rememberToken });
  } catch (error) {
    console.error('[auth] forget-device failed:', error);
  }
  return res.status(200).json({ status: 'success', success: true });
};

export default { sendOtp, verifyOtp, rememberLogin, forgetThisDevice };
