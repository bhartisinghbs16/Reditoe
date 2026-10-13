import User from '../../models/User.js';
import {
  readIdentifier,
  identifierQuery,
  checkPasswordStrength,
} from '../../utils/identifier.js';
import {
  findContactHolders,
  alreadyRegisteredBody,
  duplicateContactFields,
} from '../../utils/contactRegistry.js';
import Restaurant from '../../models/Restaurant.js';
import { proofHolds, releaseProof } from '../signupVerificationController.js';
import { accountPayload } from '../otpAuthController.js';
import { rememberDevice } from '../../services/deviceSessionService.js';
import crypto from 'crypto';
import fs from 'fs';
import { signToken } from '../../utils/jwt.js';
import { sendEmail } from '../../services/emailService.js';
import cloudStorageService from '../../services/cloudStorageService.js';
import twilio from 'twilio';
import smsService from '../../services/smsService.js';
import { getKycDisplayStatus } from '../../utils/kycStatus.js';
import { ensureReferralProfile, applyReferralCode } from '../../services/referralService.js';


// Uses .env loaded by preload-env.js (server.js)
// Brevo SMTP configuration - OTP instant delivery
const firstNonEmptyEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return { key: null, value: '' };
};

const EMAIL_SERVICE = (process.env.EMAIL_SERVICE || 'brevo').trim().toLowerCase();
const emailFromEnv = firstNonEmptyEnv('EMAIL_FROM', 'SENDGRID_FROM_EMAIL', 'EMAIL_USER');

const EMAIL_FROM = emailFromEnv.value || 'noreply@reditoe.com';

// Twilio text configuration
const text_SERVICE = (process.env.text_SERVICE || 'twilio').trim().toLowerCase();
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_PHONE_NUMBER = (process.env.TWILIO_PHONE_NUMBER || '').trim();

const __emailFromIsFromEnv = !!process.env.EMAIL_FROM;
const __emailFromDomain = (EMAIL_FROM.includes('@') ? EMAIL_FROM.split('@').pop() : 'invalid') || 'invalid';

const isEmailConfigured = ['brevo', 'ses', 'smtp'].includes(EMAIL_SERVICE)
  && !!process.env.BREVO_API_KEY
  && !!EMAIL_FROM;

const smtpConfigError = isEmailConfigured ? null : 'Brevo email API not configured';

console.log('ðŸ“§ Email Configuration Check:');
console.log('   Service:', EMAIL_SERVICE);
console.log('   BREVO_API_KEY present:', !!process.env.BREVO_API_KEY);
console.log('   EMAIL_FROM:', EMAIL_FROM);
console.log('   EMAIL_FROM source:', emailFromEnv.key || 'DEFAULT');

// Twilio: configured if credentials are set; guard so invalid/missing keys do not crash server at startup
let isTwilioConfigured = false;
let twilioClient = null;
try {
  /**
   * Named for Twilio because it was the only provider once. It now answers
   * for whichever one is configured - MSG91 on this platform - so that every
   * "can we actually send this?" check below keeps working unchanged.
   */
  isTwilioConfigured = smsService.isSmsConfigured();
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  isTwilioConfigured = false;
}

export const emailStatus = async (req, res) => {
  return res.status(200).json({
    status: 'ok',
    configured: isEmailConfigured,
    config: {
      service: EMAIL_SERVICE,
      ses: isEmailConfigured,
      emailFromDomain: __emailFromDomain,
      emailFromEnv: __emailFromIsFromEnv,
    },
    timestamp: new Date().toISOString(),
  });
};

// Service status check for both email and text
export const serviceStatus = async (req, res) => {
  return res.status(200).json({
    status: 'ok',
    email: {
      configured: isEmailConfigured,
      service: EMAIL_SERVICE,
    },
    text: {
      configured: smsService.isSmsConfigured(),
      service: smsService.smsProvider(),
    },
    timestamp: new Date().toISOString(),
  });
};

// Generate 6-digit OTP
/** How long a password-reset code is good for. */
const RESET_OTP_TTL_MS = 10 * 60 * 1000;
/** How soon another can be asked for, so this cannot be used to spam someone. */
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
/** Guesses allowed against one code before it has to be reissued. */
const RESET_MAX_ATTEMPTS = 5;

/**
 * Spends one guess against a user's reset code.
 *
 * Every failure path answers the same way — no account, wrong code, expired
 * code — so this cannot be used to work out which accounts exist or whether a
 * code is still live. A correct code leaves the counter alone; the caller
 * clears it when the reset actually completes.
 */
const consumeResetAttempt = async (user, otp) => {
  const generic = {
    ok: false,
    status: 400,
    message: 'That code is not right, or it has expired. Ask for a new one.',
  };
  if (!user || !user.resetOTP) return generic;

  if ((user.resetOTPAttempts || 0) >= RESET_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      message: 'Too many incorrect codes. Ask for a new one.',
    };
  }

  if (!user.resetOTPExpiry || new Date() > user.resetOTPExpiry) return generic;

  if (String(user.resetOTP) !== String(otp).trim()) {
    user.resetOTPAttempts = (user.resetOTPAttempts || 0) + 1;
    await user.save({ validateBeforeSave: false });
    const left = RESET_MAX_ATTEMPTS - user.resetOTPAttempts;
    return {
      ok: false,
      status: 400,
      message:
        left > 0
          ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Too many incorrect codes. Ask for a new one.',
    };
  }

  return { ok: true };
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

if (process.env.NODE_ENV !== 'production') {
  console.log('[AuthController] completeProfile duplicate-email hardening active (v2)');
}

/**
 * Reads a date of birth typed as DD/MM/YYYY or sent as an ISO date.
 *
 * Returns null unless it is a real calendar date, in the past. Rebuilt and
 * compared rather than trusted to `new Date`, which rolls 31/02 into March
 * without complaint.
 */
const parseDateOfBirth = (value) => {
  const raw = String(value ?? '').trim();
  let year;
  let month;
  let day;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
  if (iso) {
    [, year, month, day] = iso;
  } else if (local) {
    [, day, month, year] = local;
  } else {
    return null;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const real =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  if (!real || Number(year) < 1900 || date.getTime() > Date.now()) return null;
  return date;
};

/**
 * Create a customer account - POST /api/auth/register
 *
 * The last step of signing up on the customer app. It is reached only after
 * the mobile number has been proved by a one-time code, and that proof arrives
 * here as `phoneProof`: the server issued it when the code came back, and an
 * account is not created on a number without it. There is no password to
 * choose - the number is how this account is signed into from now on.
 *
 * Multipart, because the profile photo travels with the rest of the details.
 * Answers with a session, since the number has already been proved.
 *
 * Nobody is signed in when this is called, so the upload has already been
 * written to disk by the time any of the checks below run. Whatever the answer
 * turns out to be, that temporary file is removed on the way out: left alone,
 * every refused request would keep its photo, and anyone could fill the disk
 * with them.
 */
export const register = async (req, res) => {
  try {
    return await registerCustomer(req, res);
  } finally {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  }
};

const registerCustomer = async (req, res) => {
  try {
    const { name, email, phone, phoneProof, dateOfBirth, referralCode } = req.body ?? {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ status: 'error', message: 'Enter your full name.' });
    }

    const emailId = readIdentifier(email);
    if (emailId.kind !== 'email') {
      return res.status(400).json({
        status: 'error',
        message: 'That email address does not look right.',
      });
    }

    const phoneId = readIdentifier(phone);
    if (phoneId.kind !== 'phone') {
      return res.status(400).json({ status: 'error', message: phoneId.reason });
    }

    const born = parseDateOfBirth(dateOfBirth);
    if (!born) {
      return res.status(400).json({
        status: 'error',
        message: 'Enter your date of birth as DD/MM/YYYY.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Add a profile photo.' });
    }

    if (!(await proofHolds('phone', phoneId.value, phoneProof))) {
      return res.status(400).json({
        status: 'error',
        code: 'contact_not_verified',
        message: 'Verify your mobile number with the code we send before signing up.',
      });
    }

    /**
     * An email address or mobile number that any account already holds cannot
     * be registered again under this one. Answered without naming the other
     * account.
     */
    const conflict = await findContactHolders({ email: emailId.value, phone: phoneId.value });
    if (conflict) {
      return res.status(409).json(alreadyRegisteredBody(conflict));
    }

    // Before the account exists, so a photo that cannot be stored leaves no
    // half-made customer behind.
    const upload = await cloudStorageService.uploadFile(req.file, 's3', {
      category: 'profile-photos',
      folder: 'profile-photos',
    });

    const user = await User.create({
      name: String(name).trim(),
      email: emailId.value,
      phone: phoneId.value,
      dateOfBirth: born,
      role: 'user',
      /*
       * The schema wants a password and there is nobody to choose one. An
       * unguessable value nobody is ever shown satisfies it and opens nothing:
       * the only way in is the code sent to the number.
       */
      password: crypto.randomBytes(24).toString('base64url'),
      profilePhoto: upload.publicUrl,
      avatar: upload.publicUrl,
      isProfileComplete: true,
      accountVerified: true,
      /*
       * A new account starts with an empty wallet. It used to start with
       * 3000, which was sample data from before real payments: every customer
       * who signed up was handed spendable credit against live orders.
       */
      walletBalance: 0,
    });

    try {
      await ensureReferralProfile(user._id);
    } catch (refErr) {
      console.log('Referral profile create error:', refErr.message);
    }

    if (referralCode) {
      try {
        await applyReferralCode({
          userId: user._id,
          code: String(referralCode).trim().toUpperCase(),
        });
      } catch (refCodeErr) {
        console.log('Referral code apply error:', refCodeErr.message);
      }
    }

    // One use. The account exists now, and a second registration on the same
    // number is refused above anyway; the proof has nothing left to do.
    await releaseProof('phone', phoneId.value).catch(() => {});

    // The number was proved a moment ago, so this phone is remembered the
    // same way a returning customer's would be - if the app asked.
    const remembered = await rememberDevice({
      userId: user._id,
      role: 'user',
      deviceId: req.body?.deviceId,
    }).catch(() => null);

    return res.status(201).json({
      status: 'success',
      token: signToken(user._id),
      data: { user: accountPayload(user) },
      ...(remembered ?? {}),
    });
  } catch (error) {
    /**
     * Two requests for the same address can both pass the check above; the
     * database stops the second.
     */
    const clashed = duplicateContactFields(error);
    if (clashed) {
      return res.status(409).json(alreadyRegisteredBody({ fields: clashed }));
    }

    console.error('[auth] register failed:', error);
    return res.status(400).json({ status: 'error', message: error.message });
  }
};

/**
 * The vendor account a registration is finishing, or null.
 *
 * Sign-up makes the account first and the restaurant second. If the second step
 * fails the vendor is left with an account that can sign in and nothing to run,
 * and has to be able to come back and complete it - on the same account, never
 * a second one. That is only what this recognises: one account holds every
 * contact detail given, it is a vendor's, and it has no restaurant.
 */
const unfinishedVendor = async (conflict) => {
  if (!conflict || conflict.holders.length !== 1) return null;
  const [holder] = conflict.holders;
  if (holder.role !== 'vendor') return null;
  if (!conflict.asked.every((field) => conflict.fields.includes(field))) return null;
  if (await Restaurant.exists({ owner: holder._id })) return null;
  return holder;
};

export const registerVendor = async (req, res) => {
  try {
    const {
      phone,
      email,
      restaurantName,
      cuisine,
      street,
      city,
      zipCode,
      contactPersonName,
      contactPersonNumber,
      countryCode = '+91',
      bankDetails,
      latitude,
      longitude,
      referralCode,
    } = req.body;

    /*
     * The mobile number is how a vendor signs in - by a code sent to it, there
     * is no password - so it is required here and has to be one the vendor has
     * proved they hold. The email address is optional.
     */
    if (!phone || !restaurantName || !city) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number, restaurant name and city are required',
      });
    }

    /*
     * A vendor signing themselves up proves both contact details first.
     *
     * The phone number is what riders and customers use to reach the kitchen,
     * and the email is where the set-password link goes, so neither can be
     * somebody else's. Checked against a proof the verification endpoints
     * issued: a "verified" flag from the app would be worth nothing, since
     * anyone can post to this endpoint directly.
     *
     * A vendor an admin creates goes through the console's own confirmation
     * instead, and does not come through here.
     */
    if (email || phone) {
      const [emailProved, phoneOk] = await Promise.all([
        email ? proofHolds('email', email, req.body.emailProof) : Promise.resolve(true),
        phone ? proofHolds('phone', phone, req.body.phoneProof) : Promise.resolve(true),
      ]);

      /*
       * A vendor finishing a registration that stopped half way is not asked to
       * verify their own email again. They cannot be: a code is never sent to an
       * address an account already holds. What is needed instead is that they
       * have just proved the phone - which is what the account is signed into -
       * and that the address is that same account's own.
       */
      const emailOk =
        emailProved ||
        (phoneOk && Boolean(await unfinishedVendor(await findContactHolders({ email, phone }))));

      if (!emailOk || !phoneOk) {
        return res.status(400).json({
          success: false,
          code: 'contact_not_verified',
          message: !emailOk && !phoneOk
            ? 'Verify the email address and mobile number before submitting.'
            : !emailOk
              ? 'Verify the email address before submitting.'
              : 'Verify the mobile number before submitting.',
        });
      }
    }

    /**
     * The same rules the rest of the platform applies.
     *
     * Self-registration accepted any string as an email and any string as a
     * phone number - an account created that way is one the vendor cannot be
     * contacted on.
     */
    if (email) {
      const emailId = readIdentifier(email);
      if (emailId.kind !== 'email') {
        return res.status(400).json({
          success: false,
          message: 'That email address does not look right.',
        });
      }
    }

    let phoneId = null;
    if (phone) {
      phoneId = readIdentifier(phone);
      if (phoneId.kind !== 'phone') {
        return res.status(400).json({ success: false, message: phoneId.reason });
      }
    }

    /**
     * An email address or mobile number belongs to one account, whatever role
     * it was registered under.
     *
     * This looked the identifier up and, finding any account at all, made it a
     * vendor - so a customer's or a delivery partner's number could be
     * registered as a restaurant, and the account behind it quietly became a
     * vendor account. It also compared `phone` with the raw string the app
     * sent, which never equals the stored +91 form, so a number already in use
     * looked free and a second account was created on it.
     *
     * It also answered "Welcome back" with a session token whenever the
     * address belonged to an existing vendor, no password asked: registering
     * was a way to sign in.
     *
     * The one thing let through is a vendor finishing what they started: the
     * same account, still without a restaurant, because an earlier attempt
     * created it and then failed. Every contact detail given has to belong to
     * that one account, and nothing about it is overwritten.
     */
    let user = null;
    const conflict = await findContactHolders({ email, phone });
    if (conflict) {
      const finishing = await unfinishedVendor(conflict);
      if (!finishing) {
        return res.status(409).json(alreadyRegisteredBody(conflict));
      }
      user = await User.findById(finishing._id);
    }

    // Create vendor user if not exists
    if (!user) {
      user = await User.create({
        name: contactPersonName || restaurantName,
        // Saved in the +91 form every other sign-up uses, so it can be found
        // again by the same number however it is typed.
        phone: phoneId?.value ?? '',
        email: email || `vendor_${phone}_${Date.now()}@vendor.reditoe.com`,
        /*
         * The schema wants a password and a vendor signs in by code, not by
         * password. An unguessable value nobody is ever shown satisfies it and
         * opens nothing.
         */
        password: crypto.randomBytes(24).toString('base64url'),
        role: 'vendor',
        walletBalance: 0,
      });
    } else if (contactPersonName && contactPersonName !== user.name) {
      user.name = contactPersonName;
      await user.save();
    }

    // Record a user-originated vendor referral at registration time. Reward is
    // held until the restaurant is approved by admin.
    if (referralCode && user?.role === 'vendor') {
      try {
        const { registerReferralInvite } = await import('../../services/referralService.js');
        await registerReferralInvite({ code: referralCode, targetType: 'vendor', entityId: user._id });
      } catch (referralError) {
        console.warn('Vendor referral registration skipped:', referralError.message);
      }
    }

    // Create restaurant with pending status
    const restaurant = await Restaurant.create({
      name: restaurantName,
      owner: user._id,
      status: 'pending',
      isEnabled: false,
      phone: contactPersonNumber ? `${countryCode}${contactPersonNumber}` : (phone || user.phone || ''),
      categories: cuisine ? [cuisine] : ['Fast Food'],
      address: {
        street: street || '',
        city: city || '',
        zipCode: zipCode || '',
        /**
         * Captured from the device during sign-up.
         *
         * Dispatch measures a rider's distance from these, so a restaurant
         * without them cannot be offered to anyone by the radius rules --
         * registration collected an address and never a position.
         */
        ...(Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
          ? { coordinates: { latitude: Number(latitude), longitude: Number(longitude) } }
          : {}),
      },
      /**
       * The bank account, when the sign-up collected one.
       *
       * The registration screen asks for it and it was going nowhere: the
       * payload never carried it and this never read it, so a vendor filled in
       * their account details and we stored none of them.
       */
      ...(bankDetails && (bankDetails.accountNumber || bankDetails.bankName)
        ? {
            bankDetails: {
              accountHolderName: bankDetails.accountHolderName || '',
              accountNumber: bankDetails.accountNumber || '',
              ifsc: (bankDetails.ifsc || '').toUpperCase(),
              bankName: bankDetails.bankName || '',
            },
          }
        : {}),
      description: `${restaurantName} - Pending approval`,
      openingHours: '9:00 AM - 10:00 PM',
      deliveryTime: '30-45 min',
      deliveryFee: 40,
    });

    // Generate token
    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Vendor registration successful. Your account is pending approval.',
      token,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
        restaurant: {
          id: restaurant._id,
          name: restaurant.name,
          status: restaurant.status,
          /*
           * The reference the vendor should quote, and the same one the admin
           * console prints. The app was deriving an application number of its
           * own from the id, so the number on the completion screen matched
           * neither the outlet id in the app nor anything an admin could
           * search for.
           */
          outletId: restaurant.outletId,
        },
      },
    });
  } catch (error) {
    const clashed = duplicateContactFields(error);
    if (clashed) {
      return res.status(409).json(alreadyRegisteredBody({ fields: clashed }));
    }

    console.error('Vendor registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
};

// Signup (alias for register - keeping for backward compatibility)
export const signup = register;

/**
 * Password and Google sign-in are gone.
 *
 * The customer, vendor and delivery-partner apps sign in one way only - a
 * mobile number and the one-time code sent to it (see otpAuthController). These
 * routes still answer, with a reason, rather than falling through to "route not
 * found": an app build that predates the change should be told what happened,
 * not left to guess at a broken server.
 *
 * 410 rather than a 4xx about the credentials: nothing about what was typed is
 * wrong, there is simply no longer anything to sign in to.
 */
const removed = (what) => (_req, res) =>
  res.status(410).json({
    status: 'error',
    success: false,
    code: 'password_login_removed',
    message: `${what} is no longer available. Sign in with your mobile number and the one-time code we text you.`,
  });

export const login = removed('Signing in with a password');
export const googleLogin = removed('Google sign-in');
export const setPassword = removed('Setting a password');

// Get current user profile - GET /api/auth/profile (protected route)
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Build user response object
    const resolvedProfilePhoto =
      user.profilePhoto ||
      user.avatar ||
      user?.kycDocuments?.photo ||
      '';
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isProfileComplete: user.isProfileComplete,
      role: user.role,
      walletBalance: user.walletBalance,
      savedAddresses: user.savedAddresses,
      avatar: resolvedProfilePhoto,
      profilePhoto: resolvedProfilePhoto,
      bankDetails: user.bankDetails || {},
      /*
       * Whether this account may pay cash.
       *
       * The admin has had a per-customer switch for it and the order endpoint
       * has always enforced it, but it was never sent to the app — so the
       * customer app could not know, never offered cash, and turning the
       * switch on appeared to do nothing.
       */
      codEnabled: user.codEnabled === true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Include rider-specific fields if user is a rider
    if (user.role === 'rider') {
      userResponse.riderId = user.riderId;
      userResponse.vehicleType = user.vehicleType;
      userResponse.vehicleName = user.vehicleName;
      userResponse.vehicleNumber = user.vehicleNumber;
      userResponse.currentRating = user.currentRating;
      userResponse.isOnline = user.isOnline || false; // Include isOnline status
      userResponse.bankDetails = user.bankDetails;
      userResponse.totalTrips = user.totalTrips || 0;
      userResponse.completedTrips = user.completedTrips || 0;
      userResponse.cancelledTrips = user.cancelledTrips || 0;
      userResponse.perKmCharge = user.perKmCharge || 10;
      userResponse.kycStatus = user.kycStatus || 'pending';
      userResponse.kycDisplayStatus = getKycDisplayStatus(user.kycStatus);
      userResponse.referralEarnings = user.referralEarnings || 0;
      userResponse.totalReferrals = user.totalReferrals || 0;
      userResponse.firstOrderCompleted = user.firstOrderCompleted || false;
      userResponse.aadhaarVerified = user.aadhaarVerified || false;
      userResponse.drivingLicenceVerified = user.drivingLicenceVerified || false;
      userResponse.vehicleRcVerified = user.vehicleRcVerified || false;
      userResponse.insuranceExpiry = user.insuranceExpiry || null;
    }

    // Include vendor-specific fields if user is a vendor
    if (user.role === 'vendor') {
      userResponse.bio = user.bio;
      userResponse.location = user.location;
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: userResponse,
      },
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Get current user (alias for getProfile - keeping for backward compatibility)
export const getMe = getProfile;

// Update user profile - PUT /api/auth/profile (protected route)
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const allowed = ['name', 'savedAddresses', 'avatar'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        user[key] = req.body[key];
      }
    }
    /*
     * The mobile number is how this account is signed into, so a profile form
     * cannot change it. Proving a number means a code sent to it; a form that
     * simply saved whatever was typed would let somebody put another person's
     * number on their own account - and that person, signing in with a code to
     * their own phone, would land in a stranger's account while the stranger's
     * existing session kept working. Sending back the number the account
     * already has is harmless and accepted.
     */
    if (req.body.phone !== undefined && String(req.body.phone).trim() !== '') {
      const typed = readIdentifier(req.body.phone);
      const current = readIdentifier(user.phone);
      const unchanged =
        typed.kind === 'phone' && current.kind === 'phone' && typed.value === current.value;
      if (!unchanged) {
        return res.status(400).json({
          status: 'error',
          code: 'phone_locked',
          message:
            'Your mobile number is how you sign in, so it cannot be changed here. Contact support to change it.',
        });
      }
    }
    if (req.file) {
      const provider = 's3';
      const uploadResult = await cloudStorageService.uploadFile(req.file, provider, {
        category: 'profile-photos',
        folder: 'profile-photos',
        userId: user._id,
      });
      user.profilePhoto = uploadResult.publicUrl;
      user.avatar = uploadResult.publicUrl;
    }
    await user.save();
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isProfileComplete: user.isProfileComplete,
      role: user.role,
      walletBalance: user.walletBalance,
      savedAddresses: user.savedAddresses,
      avatar: user.avatar || user.profilePhoto || '',
      profilePhoto: user.profilePhoto || '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    if (user.role === 'rider') {
      userResponse.riderId = user.riderId;
      userResponse.vehicleName = user.vehicleName;
      userResponse.vehicleNumber = user.vehicleNumber;
      userResponse.currentRating = user.currentRating;
      userResponse.isOnline = user.isOnline || false;
    }
    if (user.role === 'vendor') {
      userResponse.bio = user.bio;
      userResponse.location = user.location;
    }
    res.status(200).json({ status: 'success', data: { user: userResponse } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const completeProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const {
      name,
      email,
      phone,
      dateOfBirth,
      alternativePhone,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required',
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const isFirstTimeCompletion = !existingUser.isProfileComplete;
    const normalizedAlternativePhone = (alternativePhone || '').trim();
    const hasProfilePhotoUpload = !!req.file;
    const hasExistingProfilePhoto = !!existingUser.profilePhoto;
    /*
     * The number the account signed in with is the only one it has. It was
     * proved by a code, and this form does not get to replace it with one that
     * was merely typed.
     */
    const hasVerifiedPhone = !!(existingUser.phone && existingUser.phone.trim());

    if (isFirstTimeCompletion) {
      if (!dateOfBirth) {
        return res.status(400).json({
          success: false,
          message: 'Date of birth is required',
        });
      }
      if (!hasProfilePhotoUpload && !hasExistingProfilePhoto) {
        return res.status(400).json({
          success: false,
          message: 'Profile photo is required',
        });
      }
      if (!hasVerifiedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Verified phone number is required before profile completion',
        });
      }
    }

    /**
     * Guard email and phone ownership when either is being set or changed, and
     * prevent raw Mongo duplicate-key failures.
     *
     * Checked across every role and every stored form of a number: the phone
     * query here matched only the +91 form, so a number saved as bare digits
     * under another account read as free.
     */
    const changingEmail = normalizedEmail !== String(existingUser.email || '').toLowerCase();
    if (changingEmail) {
      const conflict = await findContactHolders(
        {
          email: changingEmail ? normalizedEmail : undefined,
        },
        { exceptUserId: userId }
      );
      if (conflict) {
        return res.status(409).json(alreadyRegisteredBody(conflict));
      }
    }

    // Handle profile photo upload
    let profilePhoto = '';
    if (req.file) {
      const provider = 's3';
      const uploadResult = await cloudStorageService.uploadFile(
        req.file, provider, {
          category: 'profile-photos',
          folder: 'profile-photos',
          userId,
        }
      );
      profilePhoto = uploadResult.publicUrl;
    }

    const updateData = {
      name: name.trim(),
      email: normalizedEmail,
      isProfileComplete: true,
    };

    if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
    if (alternativePhone) updateData.alternativePhone = normalizedAlternativePhone;
    if (profilePhoto) {
      updateData.profilePhoto = profilePhoto;
      updateData.avatar = profilePhoto; // keep legacy avatar consumers in sync
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile completed successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          alternativePhone: user.alternativePhone,
          profilePhoto: user.profilePhoto,
          isProfileComplete: user.isProfileComplete,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Complete profile error:', error);

    if (error?.code === 11000 && String(error?.message || '').includes('email')) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'This email is already registered. Please sign in with that account or use a different email.',
      });
    }

    if (error?.code === 11000 && String(error?.message || '').includes('phone')) {
      return res.status(409).json({
        success: false,
        code: 'PHONE_ALREADY_EXISTS',
        message: 'This phone number is already registered. Please sign in with that account or use a different number.',
      });
    }

    if (String(error?.message || '').toLowerCase().includes('duplicate key')) {
      const duplicateMessage = String(error?.message || '').toLowerCase();
      const phoneConflict = duplicateMessage.includes('phone');
      return res.status(409).json({
        success: false,
        code: phoneConflict ? 'PHONE_ALREADY_EXISTS' : 'EMAIL_ALREADY_EXISTS',
        message: phoneConflict
          ? 'This phone number is already registered. Please sign in with that account or use a different number.'
          : 'This email is already registered. Please sign in with that account or use a different email.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to complete profile. Please try again.',
    });
  }
};

/**
 * Forgot password, step one: send a code.
 *
 * Takes an email address or a mobile number and sends the code to whichever
 * was given — this used to accept an email alone, so a customer who registered
 * by mobile could not reset their password at all.
 *
 * Two protections the previous version had neither of: a resend cooldown, so
 * this cannot be used to have us message somebody repeatedly, and an attempt
 * counter reset with each new code, so a six-digit secret cannot be guessed at
 * leisure.
 */
export const forgotPassword = async (req, res) => {
  try {
    const { emailOrPhone, email, phone } = req.body;
    const identifier = readIdentifier(emailOrPhone ?? email ?? phone);
    if (!identifier.kind) {
      return res.status(400).json({
        status: 'error',
        message: identifier.reason || 'Enter your email address or mobile number.',
      });
    }

    const user = await User.findOne(identifierQuery(identifier)).select(
      '+resetOTP +resetOTPExpiry +resetOTPAttempts +resetOTPSentAt +resetOTPChannel'
    );

    /**
     * Whether an account exists is not something this endpoint should reveal —
     * it would otherwise enumerate customers. The answer is the same either
     * way; only a real account is actually sent anything.
     */
    if (!user) {
      return res.json({
        status: 'success',
        success: true,
        message: `If that account exists, a code has been sent to it.`,
        channel: identifier.kind,
      });
    }

    const sinceLast = user.resetOTPSentAt ? Date.now() - user.resetOTPSentAt.getTime() : Infinity;
    if (sinceLast < RESET_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESET_RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return res.status(429).json({
        status: 'error',
        message: `A code was just sent. Try again in ${wait} second${wait === 1 ? '' : 's'}.`,
        retryAfterSeconds: wait,
      });
    }

    const otp = generateOTP();
    user.resetOTP = otp;
    user.resetOTPExpiry = new Date(Date.now() + RESET_OTP_TTL_MS);
    user.resetOTPAttempts = 0;
    user.resetOTPSentAt = new Date();
    user.resetOTPChannel = identifier.kind;
    await user.save({ validateBeforeSave: false });

    let sent = false;
    let providerConfigured = false;

    if (identifier.kind === 'email') {
      providerConfigured = Boolean(process.env.BREVO_API_KEY);
      const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #E63946;">Password Reset Request</h2>
        <p>Your OTP for password reset is:</p>
        <h1 style="color: #E63946; font-size: 40px; letter-spacing: 8px; text-align: center;">${otp}</h1>
        <p>This OTP will expire in ${RESET_OTP_TTL_MS / 60000} minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `;
      sent = await sendEmail(user.email, 'Password Reset OTP - Reditoe', html);
    } else {
      providerConfigured = isTwilioConfigured;
      if (isTwilioConfigured) {
        sent = await smsService.sendSms({
          to: identifier.value,
          otp,
          role: user?.role,
          message: `Your Reditoe password reset code is ${otp}. It expires in ${RESET_OTP_TTL_MS / 60000} minutes.`,
        });
      }
    }

    /**
     * A configured provider that failed is an outage and says so. No provider
     * at all is a deployment gap: the code is stored correctly and only
     * delivery is missing, so outside production it comes back in the response
     * rather than making password reset impossible to exercise.
     */
    if (!sent && providerConfigured) {
      /**
       * A configured provider that would not send is an outage, and in
       * production that is all anyone can be told - the code is not put in
       * the response, because the response is not a safe place for it.
       *
       * Off production it is, and it has to be: a provider can be configured
       * and still refuse everything - an unapproved template, an empty
       * balance, a template variable named something else - and none of that
       * is visible from here. Returning the code anyway keeps the platform
       * testable while that is sorted out, rather than making every account
       * unrecoverable the moment credentials are added.
       */
      if (process.env.NODE_ENV === 'production') {
        return res.status(502).json({
          status: 'error',
          message: 'Could not send the reset code. Please try again shortly.',
        });
      }

      console.warn(
        `[auth] ${identifier.kind} provider is configured but refused to send — ` +
          `reset OTP for ${identifier.value} is ${otp}`
      );
      return res.json({
        status: 'success',
        success: true,
        channel: identifier.kind,
        message:
          'The code could not be sent, so it is shown here instead. Check the messaging provider.',
        expiresInSeconds: RESET_OTP_TTL_MS / 1000,
        resendAfterSeconds: RESET_RESEND_COOLDOWN_MS / 1000,
        devOtp: otp,
        deliveryFailed: true,
      });
    }

    if (!sent) {
      console.warn(
        `[auth] No ${identifier.kind} provider configured — reset OTP for ${identifier.value} is ${otp}`
      );
    }

    res.json({
      status: 'success',
      success: true,
      channel: identifier.kind,
      message: sent
        ? identifier.kind === 'email'
          ? 'Code sent to your email'
          : 'Code sent to your mobile number'
        : 'Messaging is not configured on this server, so the code is shown here instead.',
      expiresInSeconds: RESET_OTP_TTL_MS / 1000,
      resendAfterSeconds: RESET_RESEND_COOLDOWN_MS / 1000,
      // Never present when a provider is configured, and never in production.
      ...(!sent && process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Forgot Password - Step 2: verify OTP
/**
 * Checks a reset code without spending it.
 *
 * Lets the app move to the "choose a new password" step before asking for one,
 * so a wrong code is caught while it can still be retyped. The code is only
 * cleared by the reset itself.
 */
export const verifyForgotOTP = async (req, res) => {
  try {
    const { emailOrPhone, email, phone, otp } = req.body;
    const identifier = readIdentifier(emailOrPhone ?? email ?? phone);
    if (!identifier.kind || !otp) {
      return res.status(400).json({
        status: 'error',
        message: identifier.reason || 'Enter the code we sent you.',
      });
    }

    const user = await User.findOne(identifierQuery(identifier)).select(
      '+resetOTP +resetOTPExpiry +resetOTPAttempts'
    );
    const check = await consumeResetAttempt(user, otp);
    if (!check.ok) {
      return res.status(check.status).json({ status: 'error', message: check.message });
    }

    res.json({
      status: 'success',
      success: true,
      message: 'Code verified',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * Forgot password, step two: set the new one.
 *
 * Same identifier rules as step one, the same attempt cap on the code, and the
 * password has to clear the strength floor the rest of the platform uses. The
 * code is cleared on success so it cannot be replayed.
 */
export const resetPassword = async (req, res) => {
  try {
    const { emailOrPhone, email, phone, otp, newPassword, password, confirmPassword } = req.body;
    const chosen = newPassword ?? password;
    const identifier = readIdentifier(emailOrPhone ?? email ?? phone);

    if (!identifier.kind || !otp || !chosen) {
      return res.status(400).json({
        status: 'error',
        message: identifier.reason || 'Enter the code and your new password.',
      });
    }

    if (confirmPassword !== undefined && confirmPassword !== chosen) {
      return res.status(400).json({
        status: 'error',
        message: 'The two passwords do not match.',
      });
    }

    const strength = checkPasswordStrength(chosen);
    if (!strength.ok) {
      return res.status(400).json({ status: 'error', message: strength.reason });
    }

    const user = await User.findOne(identifierQuery(identifier)).select(
      '+password +resetOTP +resetOTPExpiry +resetOTPAttempts'
    );
    const check = await consumeResetAttempt(user, otp);
    if (!check.ok) {
      return res.status(check.status).json({ status: 'error', message: check.message });
    }

    user.password = chosen;
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    user.resetOTPAttempts = 0;
    user.resetOTPSentAt = undefined;
    user.resetOTPChannel = undefined;
    await user.save();

    res.json({
      status: 'success',
      success: true,
      message: 'Password changed. Sign in with it now.',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};




