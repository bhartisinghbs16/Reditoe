/**
 * Verifying an email address and a phone number before an account exists.
 *
 * Used by vendor and rider signup alike, which ask for the same thing: a code
 * to each contact detail, a tick beside it once confirmed, and no way to
 * finish signing up until both are done.
 *
 * The app is never trusted to say a contact was verified. Confirming a code
 * hands back a proof, and registration will not accept a contact detail
 * without one - otherwise "verified" is just a flag the client could set.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import SignupVerification from '../models/SignupVerification.js';
import User from '../models/User.js';
import { sendEmail } from '../services/emailService.js';
import { sendSms, isSmsConfigured } from '../services/smsService.js';

const TTL_MINUTES = 15;

/**
 * How long a verified contact detail stays good for.
 *
 * The row carries two things at once: the code, which should be short-lived,
 * and the proof that the code was entered, which the registration form hands
 * back at the end. The row was removed fifteen minutes after the code was
 * sent, taking the proof with it - so a rider who spent longer than that
 * filling in five steps and photographing four documents, which is normal,
 * reached Submit and was told to verify their details again.
 *
 * It also leaves the evidence that somebody started signing up and did not
 * finish, which is what the console shows as onboarding pending.
 */
const VERIFIED_TTL_DAYS = 7;
/** Enough tries for a mistyped digit, few enough that guessing is hopeless. */
const MAX_ATTEMPTS = 5;

const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const normalise = (channel, value) => {
  const trimmed = String(value ?? '').trim();
  if (channel === 'email') return trimmed.toLowerCase();
  // Compared on the last ten digits, so +91 and 0 prefixes are the same number.
  return trimmed.replace(/\D/g, '').slice(-10);
};

const looksValid = (channel, value) =>
  channel === 'email'
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    : /^[6-9]\d{9}$/.test(value);

/**
 * POST /api/signup-verification/send
 * Body: { channel: 'email' | 'phone', value, role }
 */
export const sendSignupCode = async (req, res) => {
  try {
    const channel = String(req.body?.channel ?? '').toLowerCase();
    if (!['email', 'phone'].includes(channel)) {
      return res.status(400).json({ status: 'error', message: 'channel must be email or phone' });
    }

    const value = normalise(channel, req.body?.value);
    if (!looksValid(channel, value)) {
      return res.status(400).json({
        status: 'error',
        message: channel === 'email' ? 'Enter a valid email address.' : 'Enter a valid 10-digit mobile number.',
      });
    }

    /*
     * Somebody already holds this. Said plainly rather than sending a code to
     * an address that cannot be registered anyway - the alternative is a
     * signup that only fails at the last step.
     */
    const taken = await User.findOne(
      channel === 'email' ? { email: value } : { phone: new RegExp(`${value}$`) }
    ).lean();
    if (taken) {
      return res.status(409).json({
        status: 'error',
        code: 'already_registered',
        message:
          channel === 'email'
            ? 'An account already uses that email address. Sign in instead.'
            : 'An account already uses that mobile number. Sign in instead.',
      });
    }

    const code = sixDigits();
    await SignupVerification.findOneAndUpdate(
      { channel, value },
      {
        channel,
        value,
        codeHash: await bcrypt.hash(code, 10),
        attempts: 0,
        verified: false,
        proof: undefined,
        // The other detail on the same form, so the two rows a signup leaves
        // behind can be recognised as one person.
        counterpart: normalise(
          channel === 'email' ? 'phone' : 'email',
          req.body?.counterpart
        ) || undefined,
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const role = String(req.body?.role ?? 'partner');
    if (channel === 'email') {
      await sendEmail(
        value,
        'Your Reditoe verification code',
        `<p>Your Reditoe ${role} signup code is <strong>${code}</strong>.</p>
         <p>It expires in ${TTL_MINUTES} minutes.</p>`
      );
    } else {
      if (!isSmsConfigured()) {
        return res.status(503).json({
          status: 'error',
          code: 'sms_unavailable',
          message: 'Mobile verification is unavailable right now. Please try again shortly.',
        });
      }
      await sendSms({
        to: value,
        otp: code,
        role,
        message: `${code} is your Reditoe verification code. It expires in ${TTL_MINUTES} minutes.`,
      });
    }

    return res.json({
      status: 'success',
      message: `Code sent to your ${channel === 'email' ? 'email address' : 'mobile number'}.`,
      data: { channel, expiresInMinutes: TTL_MINUTES },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not send the code',
    });
  }
};

/**
 * POST /api/signup-verification/confirm
 * Body: { channel, value, code }
 */
export const confirmSignupCode = async (req, res) => {
  try {
    const channel = String(req.body?.channel ?? '').toLowerCase();
    const value = normalise(channel, req.body?.value);
    const code = String(req.body?.code ?? '').trim();

    const record = await SignupVerification.findOne({ channel, value }).select('+codeHash +proof');
    if (!record) {
      return res.status(404).json({
        status: 'error',
        message: 'No code was sent to that address. Ask for one first.',
      });
    }
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ status: 'error', message: 'That code has expired. Ask for a new one.' });
    }
    if (record.verified && record.proof) {
      // Already done. Handing the proof back keeps a retry harmless.
      return res.json({ status: 'success', message: 'Already verified.', data: { proof: record.proof } });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many attempts. Ask for a new code.',
      });
    }

    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, record.codeHash))) {
      record.attempts += 1;
      await record.save();
      const left = Math.max(0, MAX_ATTEMPTS - record.attempts);
      return res.status(400).json({
        status: 'error',
        message: left > 0 ? `That code is not right. ${left} attempt(s) left.` : 'Too many attempts. Ask for a new code.',
      });
    }

    record.verified = true;
    record.proof = crypto.randomBytes(24).toString('hex');
    record.codeHash = undefined;
    // The code is spent; the proof it leaves behind has to outlive the form.
    record.expiresAt = new Date(Date.now() + VERIFIED_TTL_DAYS * 24 * 60 * 60 * 1000);
    await record.save();

    return res.json({
      status: 'success',
      message: 'Verified.',
      data: { proof: record.proof },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not confirm the code',
    });
  }
};

/**
 * Checks a proof handed back at registration.
 *
 * Exported for the registration controllers rather than exposed as a route:
 * nothing outside the server should be able to ask whether a proof is good.
 */
export const proofHolds = async (channel, value, proof) => {
  if (!proof) return false;
  const record = await SignupVerification.findOne({
    channel,
    value: normalise(channel, value),
    verified: true,
  }).select('+proof');
  return Boolean(record?.proof && record.proof === proof);
};

export default { sendSignupCode, confirmSignupCode, proofHolds };
