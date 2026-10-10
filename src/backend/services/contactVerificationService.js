/**
 * Two-channel verification for accounts staff create on someone's behalf.
 *
 * A vendor or delivery partner entered into the admin console has never
 * proved they hold the email address or the phone number typed for them. A
 * mistyped digit produces an account nobody can sign into, and nobody finds
 * out until the person tries and fails. So both are checked before the
 * account is allowed to work: a code to the address, a code to the number,
 * and the account stays inactive until both come back.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sendEmail } from './emailService.js';
import { sendSms, isSmsConfigured } from './smsService.js';

/** How long a pair of codes is good for. */
const TTL_MINUTES = 30;

/**
 * Six digits, drawn from the system generator rather than Math.random.
 *
 * These gate whether an account becomes usable, so they should not be
 * predictable from the time one was issued.
 */
const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Issues a fresh pair of codes, stores them hashed, and sends them.
 *
 * Hashed because anyone who can read the user document should not be able to
 * activate somebody else's account with what they find there.
 *
 * Delivery is reported rather than enforced: an account whose SMS could not
 * be sent is still created, and the console shows which channel failed so
 * staff can correct the number instead of losing the record they just typed.
 */
export const issueContactVerification = async (user, { role } = {}) => {
  const emailOtp = sixDigits();
  const phoneOtp = sixDigits();

  user.contactVerification = {
    emailOtp: await bcrypt.hash(emailOtp, 10),
    phoneOtp: await bcrypt.hash(phoneOtp, 10),
    emailVerified: false,
    phoneVerified: false,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
    requiredBy: 'admin',
  };
  await user.save({ validateBeforeSave: false });

  const label = role === 'vendor' ? 'restaurant' : 'delivery partner';
  const delivery = { email: false, sms: false, errors: [] };

  if (user.email) {
    try {
      await sendEmail(
        user.email,
        'Confirm your Reditoe account',
        `<p>Hello ${user.name || ''},</p>
         <p>Reditoe has created a ${label} account for you. Your email
         confirmation code is <strong>${emailOtp}</strong>.</p>
         <p>It expires in ${TTL_MINUTES} minutes.</p>`
      );
      delivery.email = true;
    } catch (error) {
      delivery.errors.push(`email: ${error.message}`);
    }
  }

  if (user.phone && isSmsConfigured()) {
    try {
      await sendSms({
        to: user.phone,
        otp: phoneOtp,
        role,
        message: `${phoneOtp} is your Reditoe confirmation code. It expires in ${TTL_MINUTES} minutes.`,
      });
      delivery.sms = true;
    } catch (error) {
      delivery.errors.push(`sms: ${error.message}`);
    }
  } else if (user.phone) {
    delivery.errors.push('sms: no SMS provider is configured on this server');
  }

  return delivery;
};

/**
 * Checks one or both codes and reports what is still outstanding.
 *
 * Each channel is confirmed independently, so a correct email code is not
 * thrown away because the phone code was mistyped alongside it.
 */
export const confirmContactVerification = async (user, { emailOtp, phoneOtp }) => {
  const record = user.contactVerification;
  if (!record?.expiresAt) {
    return { ok: false, message: 'This account has no confirmation pending.' };
  }
  if (new Date(record.expiresAt) < new Date()) {
    return { ok: false, message: 'Those codes have expired. Send new ones.' };
  }

  const digits = (value) => /^\d{6}$/.test(String(value ?? '').trim());

  if (!record.emailVerified && digits(emailOtp)) {
    if (await bcrypt.compare(String(emailOtp).trim(), record.emailOtp || '')) {
      user.contactVerification.emailVerified = true;
    }
  }
  if (!record.phoneVerified && digits(phoneOtp)) {
    if (await bcrypt.compare(String(phoneOtp).trim(), record.phoneOtp || '')) {
      user.contactVerification.phoneVerified = true;
    }
  }

  const emailDone = user.contactVerification.emailVerified === true;
  const phoneDone = user.contactVerification.phoneVerified === true;
  const complete = emailDone && phoneDone;

  if (complete) {
    user.accountVerified = true;
    // The codes have done their job; keeping them serves nobody.
    user.contactVerification.emailOtp = undefined;
    user.contactVerification.phoneOtp = undefined;
    user.contactVerification.expiresAt = undefined;
  }

  await user.save({ validateBeforeSave: false });

  return {
    ok: true,
    complete,
    emailVerified: emailDone,
    phoneVerified: phoneDone,
    message: complete
      ? 'Both codes confirmed. The account is active.'
      : `Still outstanding: ${[!emailDone && 'email', !phoneDone && 'mobile']
          .filter(Boolean)
          .join(' and ')}.`,
  };
};

export default { issueContactVerification, confirmContactVerification };
