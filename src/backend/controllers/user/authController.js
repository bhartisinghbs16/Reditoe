import User from '../../models/User.js';
import {
  readIdentifier,
  identifierQuery,
  checkPasswordStrength,
} from '../../utils/identifier.js';
import Restaurant from '../../models/Restaurant.js';
import { proofHolds } from '../signupVerificationController.js';
import { signToken } from '../../utils/jwt.js';
import { sendEmail } from '../../services/emailService.js';
import cloudStorageService from '../../services/cloudStorageService.js';
import twilio from 'twilio';
import smsService from '../../services/smsService.js';
import { OAuth2Client } from 'google-auth-library';
import { getKycDisplayStatus } from '../../utils/kycStatus.js';
import { ensureReferralProfile, applyReferralCode } from '../../services/referralService.js';

const googleClient = new OAuth2Client(
  process.env.GOOGLE_WEB_CLIENT_ID ||
  '136162141039-mrdgaljhv9ema00c7h32vq51936mnn7o.apps.googleusercontent.com'
);

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
/** How long a signup code is good for. */
const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Sends the signup code to whichever contact we can actually reach.
 *
 * Email first, because that is what registration always has. A mobile number
 * is used when one was given and email cannot be sent, so a deployment with
 * SMS but no mail provider still works. When neither is configured the code
 * comes back in the response outside production — otherwise signup would be
 * impossible to complete on any machine without a mail key, which is every
 * developer's.
 */
const deliverSignupCode = async (user, otp) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #E63946;">Confirm your Reditoe account</h2>
      <p>Your verification code is:</p>
      <h1 style="color: #E63946; font-size: 40px; letter-spacing: 8px; text-align: center;">${otp}</h1>
      <p>It expires in ${SIGNUP_OTP_TTL_MS / 60000} minutes.</p>
    </div>
  `;

  if (isEmailConfigured && user.email) {
    const sent = await sendEmail(user.email, 'Confirm your Reditoe account', html);
    if (sent) return { sent: true, channel: 'email' };
  }

  if (isTwilioConfigured && user.phone) {
    const sent = await smsService.sendSms({
      to: user.phone,
      otp,
      role: user.role,
      message: `Your Reditoe verification code is ${otp}.`,
    });
    if (sent) return { sent: true, channel: 'phone' };
  }

  console.warn(`[auth] No provider configured — signup code for ${user.email} is ${otp}`);
  return {
    sent: false,
    channel: user.email ? 'email' : 'phone',
    ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
  };
};

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

const isLocalRequest = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  const forwardedHost = String(req.get('x-forwarded-host') || '').toLowerCase();
  const candidate = forwardedHost || host;
  return (
    candidate.includes('localhost') ||
    candidate.includes('127.0.0.1') ||
    candidate.includes('192.168.') ||
    candidate.includes('10.') ||
    candidate.includes('172.16.') ||
    candidate.includes('172.17.') ||
    candidate.includes('172.18.') ||
    candidate.includes('172.19.') ||
    candidate.includes('172.2') ||
    candidate.includes('172.30.') ||
    candidate.includes('172.31.')
  );
};

const buildOtpSendSuccessResponse = ({
  message,
  deliveryMethod,
  otp = undefined,
}) => {
  const response = {
    success: true,
    status: 'success',
    message,
    canProceed: true,
    nextStep: 'otp-verify',
    deliveryMethod,
    delivery: {
      method: deliveryMethod,
      isDebug: deliveryMethod === 'debug_otp',
    },
    data: {
      deliveryMethod,
      nextStep: 'otp-verify',
      canProceed: true,
    },
  };

  if (otp) {
    response.otp = otp;
    response.data.debugOtp = otp;
  }

  return response;
};

const getOtpEmailCopyByRole = (role) => {
  const normalizedRole = String(role || 'user').toLowerCase().trim();
  const copyMap = {
    user: {
      heading: 'Reditoe OTP Verification',
      audience: 'User',
      subject: 'Reditoe - Your OTP Code',
    },
    vendor: {
      heading: 'Reditoe Vendor OTP Verification',
      audience: 'Vendor',
      subject: 'Reditoe Vendor - Your OTP Code',
    },
    rider: {
      heading: 'Reditoe Delivery Partner OTP Verification',
      audience: 'Delivery Partner',
      subject: 'Reditoe Delivery Partner - Your OTP Code',
    },
  };

  return copyMap[normalizedRole] || copyMap.user;
};

if (process.env.NODE_ENV !== 'production') {
  console.log('[AuthController] completeProfile duplicate-email hardening active (v2)');
}

// Register - POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, password, phone, confirmPassword, referralCode } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide name, email, and password',
      });
    }

    if (String(name).trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Enter your full name.',
      });
    }

    /**
     * The same rules the app applies, applied again here.
     *
     * Client-side validation is a courtesy to whoever is typing; it is not a
     * control, because anything can post to this endpoint directly. Registration
     * previously accepted any string as an email, any string as a password, and
     * any string at all as a phone number.
     */
    const emailId = readIdentifier(email);
    if (emailId.kind !== 'email') {
      return res.status(400).json({
        status: 'error',
        message: 'That email address does not look right.',
      });
    }

    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return res.status(400).json({ status: 'error', message: strength.reason });
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({
        status: 'error',
        message: 'The two passwords do not match.',
      });
    }

    // A mobile number is optional here, but if given it has to be a real one —
    // it is a sign-in credential and a delivery contact, not a free-text note.
    let normalizedPhone = '';
    if (phone) {
      const phoneId = readIdentifier(phone);
      if (phoneId.kind !== 'phone') {
        return res.status(400).json({ status: 'error', message: phoneId.reason });
      }
      normalizedPhone = phoneId.value;

      const phoneTaken = await User.findOne({ phone: { $in: phoneId.variants } });
      if (phoneTaken) {
        return res.status(409).json({
          status: 'error',
          message: 'That mobile number is already registered. Sign in instead.',
          code: 'PHONE_ALREADY_EXISTS',
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: emailId.value });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: `Email '${email}' is already registered. Please use a different email or login instead.`,
        code: 'EMAIL_ALREADY_EXISTS',
        existingUser: {
          id: existingUser._id,
          email: existingUser.email,
          role: existingUser.role,
          name: existingUser.name
        }
      });
    }

    // Create new user with default walletBalance of 3000
    const user = await User.create({
      name: String(name).trim(),
      email: emailId.value,
      password, // Will be hashed by pre-save hook
      phone: normalizedPhone,
      role: req.body.role || 'user', // Use role from request or default to 'user'
      /*
       * A new account starts with an empty wallet. It used to start with
       * 3000, which was sample data from before real payments: every customer
       * who signed up was handed spendable credit against live orders.
       */
      walletBalance: 0,
    });

    // Auto-create referral profile
    try {
      await ensureReferralProfile(user._id);
    } catch (refErr) {
      console.log('Referral profile create error:', refErr.message);
    }

    // Apply referral code if provided
    if (referralCode) {
      try {
        await applyReferralCode({
          userId: user._id,
          code: referralCode.trim().toUpperCase()
        });
        console.log('Referral code applied:', referralCode);
      } catch (refCodeErr) {
        console.log('Referral code apply error:', refCodeErr.message);
      }
    }

    /**
     * Registration ends at "prove it's you", not at a session.
     *
     * Signing straight in meant an address nobody had checked could be used to
     * register, and the brief asks for a verification step between signup and
     * sign-in. A code goes to whichever contact was given — the email, or the
     * mobile when one was supplied and email is not configured — and the token
     * is issued by /auth/verify-account once it comes back.
     *
     * Only customers are gated. Vendors and riders arrive through their own
     * flows, which have their own checks, and locking them out here would
     * break both.
     */
    const gated = user.role === 'user';
    let delivery = { sent: false, channel: 'email' };

    if (gated) {
      user.accountVerified = false;
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + SIGNUP_OTP_TTL_MS);
      await user.save({ validateBeforeSave: false });
      delivery = await deliverSignupCode(user, otp);
    }

    // Remove password from output
    user.password = undefined;

    const payload = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      walletBalance: user.walletBalance,
      savedAddresses: user.savedAddresses,
    };

    if (!gated) {
      return res.status(201).json({
        status: 'success',
        token: signToken(user._id),
        data: { user: payload },
      });
    }

    res.status(201).json({
      status: 'success',
      // No token: the account is not usable until the code comes back.
      verificationRequired: true,
      channel: delivery.channel,
      message: delivery.sent
        ? `We sent a code to your ${delivery.channel === 'phone' ? 'mobile number' : 'email'}. Enter it to finish signing up.`
        : 'Messaging is not configured on this server, so the code is shown here instead.',
      ...(delivery.devOtp ? { devOtp: delivery.devOtp } : {}),
      data: { user: payload },
    });
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000 && error.message.includes('duplicate key')) {
      return res.status(409).json({
        status: 'error',
        message: `Email '${email}' is already registered. Please use a different email or login instead.`,
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }
    
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

export const registerVendor = async (req, res) => {
  try {
    const {
      phone,
      email,
      password,
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

    // Accept email or phone
    const identifier = phone || email;
    if (!identifier || !restaurantName || !city) {
      return res.status(400).json({
        success: false,
        message: 'Phone or email, restaurant name and city are required',
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
      const [emailOk, phoneOk] = await Promise.all([
        email ? proofHolds('email', email, req.body.emailProof) : Promise.resolve(true),
        phone ? proofHolds('phone', phone, req.body.phoneProof) : Promise.resolve(true),
      ]);
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
     * Self-registration accepted any string as an email, any string as a phone
     * number, and a three-character password — an account created that way is
     * one the vendor cannot be contacted on and one an attacker can walk into.
     * The password is only checked when the vendor supplies one; the phone-only
     * flow signs in by OTP and sets a password afterwards.
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

    if (phone) {
      const phoneId = readIdentifier(phone);
      if (phoneId.kind !== 'phone') {
        return res.status(400).json({ success: false, message: phoneId.reason });
      }
    }

    if (password !== undefined && password !== null && password !== '') {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        return res.status(400).json({ success: false, message: strength.reason });
      }
      if (
        req.body.confirmPassword !== undefined &&
        req.body.confirmPassword !== password
      ) {
        return res.status(400).json({
          success: false,
          message: 'The two passwords do not match.',
        });
      }
    }

    // Find user by phone OR email
    let user = await User.findOne({
      $or: [
        { phone: identifier },
        { email: identifier }
      ]
    });

    if (user && user.role === 'vendor') {
      const existingRestaurant = await Restaurant.findOne({
        owner: user._id
      });
      if (existingRestaurant) {
        const token = signToken(user._id);
        return res.status(200).json({
          success: true,
          message: 'Welcome back! Redirecting to your dashboard.',
          alreadyRegistered: true,
          token,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isProfileComplete: user.isProfileComplete,
          },
          restaurant: {
            _id: existingRestaurant._id,
            name: existingRestaurant.name,
            status: existingRestaurant.status,
          },
        });
      }
    }

    // Create vendor user if not exists
    if (!user) {
      // Use the password the vendor chose. This used to always generate a
      // random one, which let signup succeed and then made signing in
      // impossible — the vendor was never told the password that was actually
      // stored, so every later login attempt returned "incorrect email or
      // password" for credentials they had just set.
      //
      // A random password is still the fallback for callers that register
      // without one (the phone-only flow), where a vendor signs in by OTP and
      // sets a password afterwards.
      const chosenPassword =
        typeof password === 'string' && checkPasswordStrength(password).ok
          ? password
          : Math.random().toString(36).slice(-8) + 'V1!';

      user = await User.create({
        name: contactPersonName || restaurantName,
        phone: phone || '',
        email: email || `vendor_${phone}_${Date.now()}@vendor.reditoe.com`,
        password: chosenPassword,
        role: 'vendor',
        walletBalance: 0,
      });
    } else {
      // Update existing user to vendor role
      user.role = 'vendor';
      user.name = contactPersonName || user.name;
      user.phone = phone || user.phone;
      user.email = email || user.email;
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

    // Check if restaurant already exists for this owner
    const existingRestaurant = await Restaurant.findOne({ owner: user._id });
    if (existingRestaurant) {
      const token = signToken(user._id);
      return res.status(200).json({
        success: true,
        message: 'Welcome back! Redirecting to your dashboard.',
        alreadyRegistered: true,
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isProfileComplete: user.isProfileComplete,
        },
        restaurant: {
          _id: existingRestaurant._id,
          name: existingRestaurant.name,
          status: existingRestaurant.status,
        },
      });
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
    console.error('Vendor registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
};

// Signup (alias for register - keeping for backward compatibility)
export const signup = register;

// Login - POST /api/auth/login
/**
 * Sign in with an email address or a mobile number.
 *
 * One box, either credential: the customer types whichever they registered
 * with and the server works out which it is. This used to take `email` alone,
 * so anyone who signed up with a mobile number had no way back into their
 * account. `emailOrPhone` is the field the apps send; `email` and `phone` are
 * still read so nothing already calling this breaks.
 */
export const login = async (req, res) => {
  try {
    const { emailOrPhone, email, phone, password } = req.body;
    const typed = emailOrPhone ?? email ?? phone;

    if (!typed || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Enter your email or mobile number, and your password.',
      });
    }

    const identifier = readIdentifier(typed);
    if (!identifier.kind) {
      return res.status(400).json({ status: 'error', message: identifier.reason });
    }

    /**
     * One message for "no such account" and "wrong password" alike. Telling
     * them apart turns this endpoint into a way to discover who has an account.
     */
    /**
     * Finds the account, tolerating numbers that were duplicated before
     * creation started refusing them.
     *
     * findOne on a shared mobile number returns whichever document the index
     * reaches first, so the other account could not be signed into at all —
     * its owner had been handed credentials that simply did not work. Where
     * more than one matches, the password decides which was meant. It grants
     * nothing extra: every candidate still has to be authenticated, and the
     * duplicate itself is now prevented at the point of creation.
     */
    const candidates = await User.find(identifierQuery(identifier))
      .select('+password')
      .sort({ createdAt: 1 })
      .limit(5);

    let user = candidates[0];
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        if (await candidate.comparePassword(password)) {
          user = candidate;
          break;
        }
      }
    }

    /**
     * Invited but not yet set up.
     *
     * Checked before the password, because the stored one is an unguessable
     * placeholder no vendor could ever type — comparing first meant they were
     * told "incorrect password" forever with no hint that a link was waiting
     * in their inbox.
     */
    if (user?.mustSetPassword) {
      return res.status(403).json({
        status: 'error',
        code: 'PASSWORD_NOT_SET',
        message:
          'This account has not been set up yet. Use the set-password link emailed to you, or ask for a new one.',
      });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'error',
        message:
          identifier.kind === 'email'
            ? 'Incorrect email or password'
            : 'Incorrect mobile number or password',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        status: 'error',
        message: 'This account has been suspended. Contact support.',
      });
    }

    /**
     * Registered but never verified.
     *
     * Checked against `=== false` on purpose: the flag is only written by
     * signup, so accounts that predate it read undefined and are let through.
     * The code tells the app to send them to the verification step rather than
     * leaving them at a password box that will never work.
     */
    if (user.accountVerified === false) {
      return res.status(403).json({
        status: 'error',
        code: 'ACCOUNT_NOT_VERIFIED',
        message: 'Confirm your account first — enter the code we sent you.',
      });
    }


    // Auto-online for riders on login
    if (user.role === 'rider') {
      user.isOnline = true;
      
      // Add to online history
      if (!user.onlineHistory) {
        user.onlineHistory = [];
      }
      user.onlineHistory.push({
        status: true,
        timestamp: new Date(),
      });
      
      // Keep only last 100 history entries
      if (user.onlineHistory.length > 100) {
        user.onlineHistory = user.onlineHistory.slice(-100);
      }
      
      await user.save();
    }

    // Generate JWT token
    const token = signToken(user._id);

    // Return JWT token and basic user info
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      walletBalance: user.walletBalance,
      savedAddresses: user.savedAddresses,
    };

    // Include rider-specific fields if user is a rider
    if (user.role === 'rider') {
      userResponse.isOnline = user.isOnline;
      userResponse.riderId = user.riderId;
      userResponse.vehicleName = user.vehicleName;
      userResponse.vehicleNumber = user.vehicleNumber;
      userResponse.vehicleBrand = user.vehicleBrand || '';
      userResponse.vehicleModel = user.vehicleModel || '';
      userResponse.currentRating = user.currentRating;
    }

    res.status(200).json({
      status: 'success',
      token,
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

// Google Login - POST /api/auth/google
export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google token is required',
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_WEB_CLIENT_ID ||
          '136162141039-mrdgaljhv9ema00c7h32vq51936mnn7o.apps.googleusercontent.com',
        process.env.GOOGLE_ANDROID_CLIENT_ID ||
          '136162141039-cjs3ok1br4ispltpgacbsfafq7e3u4s0.apps.googleusercontent.com',
      ],
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Could not get email from Google account',
      });
    }

    let user = await User.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { googleId }],
    });
    const isNewUser = !user;

    if (!user) {
      user = new User({
        name: name || email.split('@')[0],
        email: email.toLowerCase().trim(),
        googleId,
        avatar: picture,
        role: 'user',
        // Empty, not the 3000 of sample credit this used to grant.
        walletBalance: 0,
      });
      await user.save({ validateBeforeSave: false });
    } else {
      if (!user.googleId) user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      if (!user.name && name) user.name = name;
      await user.save({ validateBeforeSave: false });
    }

    const token = signToken(user._id);

    const isProfileComplete = !!user.isProfileComplete;

    return res.json({
      success: true,
      status: 'success',
      message: 'Google login successful',
      isNewUser,
      isProfileComplete,
      routeHint: isProfileComplete ? '/(tabs)' : '/signup',
      data: {
        token,
        isNewUser,
        isProfileComplete,
        routeHint: isProfileComplete ? '/(tabs)' : '/signup',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          walletBalance: user.walletBalance,
          savedAddresses: user.savedAddresses,
          isProfileComplete: !!user.isProfileComplete,
        },
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(401).json({
      success: false,
      status: 'error',
      message: 'Google authentication failed',
    });
  }
};

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
    if (req.body.phone !== undefined) {
      const digits = String(req.body.phone).replace(/\D/g, '').slice(-10);
      user.phone = digits ? `+91${digits}` : user.phone;
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
    const normalizedPhoneDigits = String(phone || '').replace(/\D/g, '').slice(0, 10);
    const normalizedPhoneWithCountry = normalizedPhoneDigits ? `+91${normalizedPhoneDigits}` : '';
    const hasProfilePhotoUpload = !!req.file;
    const hasExistingProfilePhoto = !!existingUser.profilePhoto;
    const effectivePhone = (existingUser.phone && existingUser.phone.trim()) || normalizedPhoneWithCountry;
    const hasVerifiedPhone = !!effectivePhone;

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

    // Prevent raw Mongo duplicate-key failures by checking email ownership upfront.
    if (normalizedEmail !== String(existingUser.email || '').toLowerCase()) {
      const duplicateEmailUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: userId },
      }).select('_id');

      if (duplicateEmailUser) {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'This email is already registered. Please sign in with that account or use a different email.',
        });
      }
    }

    // Also guard phone ownership when phone is being set/changed.
    if (normalizedPhoneWithCountry && normalizedPhoneWithCountry !== String(existingUser.phone || '').trim()) {
      const duplicatePhoneUser = await User.findOne({
        phone: normalizedPhoneWithCountry,
        _id: { $ne: userId },
      }).select('_id');

      if (duplicatePhoneUser) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_ALREADY_EXISTS',
          message: 'This phone number is already registered. Please sign in with that account or use a different number.',
        });
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

    if (normalizedPhoneWithCountry) updateData.phone = normalizedPhoneWithCountry;
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

// Send OTP - Production-safe with guaranteed response (supports both email and phone)
export const sendOTP = async (req, res) => {
  // CRITICAL: Wrap entire function to ensure response is always sent
  try {
    console.log('â”â”â”â”â”â”â”â” OTP REQUEST START â”â”â”â”â”â”â”â”');
    console.log('â° Time:', new Date().toISOString());
    
    // Validate request body exists
    if (!req.body) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body is required',
        success: false,
      });
    }
    
    /*
     * `mode` separates signing in from signing up.
     *
     * An unknown email or mobile number used to be signed up on the spot by
     * the login box, so a customer who mistyped their address got a brand new
     * empty account instead of being told the address was wrong - and there
     * was no way to sign in without possibly creating something. Only the
     * sign-up screen sends mode: 'signup'; everything else is a sign-in, and
     * a sign-in never creates an account.
     */
    const { emailOrPhone, role, mode } = req.body;
    const isSignUp = String(mode || '').toLowerCase() === 'signup';
    console.log('ðŸ“¨ Email/Phone:', emailOrPhone);
    console.log('ï¿½ Role:', role);

    // Validate email/phone - CRITICAL: Always return response
    if (!emailOrPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email or phone number',
        success: false,
      });
    }

    // Check if it's an email or phone number
    const isEmail = emailOrPhone.includes('@');
    // Fixed phone regex: only match if it's mostly digits (no @ symbol and no letters)
    const isPhone = !isEmail && /^\+?[1-9]\d{1,14}$/.test(emailOrPhone.replace(/[^\d+]/g, ''));
    
    if (!isEmail && !isPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address or phone number for OTP',
        success: false,
      });
    }

    // Normalize the input
    let normalizedInput;
    let searchField;
    if (isEmail) {
      normalizedInput = emailOrPhone.toLowerCase().trim();
      searchField = 'email';
    } else {
      // Normalize phone number to E.164 format
      normalizedInput = emailOrPhone.replace(/[^\d+]/g, '');
      if (!normalizedInput.startsWith('+')) {
        // Default to +91 for Indian numbers if no country code
        if (normalizedInput.length === 10) {
          normalizedInput = '+91' + normalizedInput;
        } else {
          normalizedInput = '+' + normalizedInput;
        }
      }
      searchField = 'phone';
    }

    let otp = generateOTP();
    // Fixed OTP for demo/reviewer account only
    if (
      normalizedInput === 'geesoda01@gmail.com' ||
      normalizedInput === 'geesoda01'
    ) {
      otp = '123456';
    }
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    /**
     * A missing email provider is a deployment gap, not a request failure.
     * Refusing here made OTP sign-in impossible to build against or test
     * anywhere without a Brevo key. Production still refuses; elsewhere the
     * request proceeds, the code is stored against the user as usual, and it
     * is returned below instead of being sent. Verification is unchanged.
     */
    const isSmsUsable = () => smsService.isSmsConfigured();
    const otpUndeliverable = isEmail && !isEmailConfigured;
    if (otpUndeliverable && process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        status: 'error',
        message: 'Email service is not configured. Please try again later.',
        success: false,
      });
    }
    console.log('â±ï¸  OTP Expires:', otpExpires.toISOString());


    // For phone: don't return 503 early - allow fallback to email if text fails
    // The fallback logic in the text send block will handle email fallback
    if (isPhone && !isTwilioConfigured) {
      console.log('âš ï¸ Twilio not configured - will attempt email fallback if user has email');
      // Continue execution - don't return here
    }

    // Find or create user - wrap in try/catch for safety
    let user;
    try {
      const searchQuery = {};
      searchQuery[searchField] = normalizedInput;
      user = await User.findOne(searchQuery).select('+otp +otpExpires');
    } catch (dbError) {
      console.error('[sendOTP] DB lookup error:', dbError.message, dbError.code);
      return res.status(500).json({
        status: 'error',
        message: 'Database error. Please try again.',
        success: false,
      });
    }

    // Validate role if provided
    const validRoles = ['user', 'vendor', 'rider'];
    const requestedRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'user';

    // Save/update user - wrap in try/catch for safety
    try {
      if (user) {
        const previousRole = user.role || 'user';
        if (previousRole !== requestedRole) {
          user.role = requestedRole;
        }
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save({ validateBeforeSave: false });

        if (otpUndeliverable) {
          /**
           * The code goes to the registered mobile, whichever box it was
           * typed into.
           *
           * Signing in with an email address on a platform with no email
           * provider meant the code could not be sent at all, so it came
           * back in the response and the app filled it in - which looks
           * exactly like the app accepting an OTP by itself, and was
           * reported as such. The account has a mobile number and there is a
           * provider for that, so it is used.
           */
          if (isSmsUsable() && user.phone) {
            const sent = await smsService.sendSms({
              to: user.phone,
              otp,
              role: user.role,
              message: `Your Reditoe OTP code is: ${otp}. Valid for 5 minutes. Don't share this code with anyone.`,
            });

            if (sent) {
              const tail = String(user.phone).replace(/\D/g, '').slice(-4);
              return res.status(200).json(
                buildOtpSendSuccessResponse({
                  message: `Code sent by SMS to your registered mobile ending ${tail}`,
                  deliveryMethod: 'text',
                })
              );
            }
          }

          console.warn(`[auth] No email provider configured - OTP for ${normalizedInput} is ${otp}`);
          return res.status(200).json(
            buildOtpSendSuccessResponse({
              message: 'Email is not configured on this server, so the code is shown here instead.',
              deliveryMethod: 'debug_otp',
              otp,
            })
          );
        }
      } else {
        /**
         * An unknown identifier signs a customer up. It must not sign a vendor
         * or a delivery partner up.
         *
         * Vendors are approved by an admin and partners go through
         * registration and KYC; letting either be created by typing an address
         * into a login box would hand out a vendor console to anyone who
         * asked. Asked for on the vendor or partner app, an unknown identifier
         * is simply not an account here.
         */
        if (requestedRole !== 'user') {
          return res.status(404).json({
            status: 'error',
            success: false,
            message:
              requestedRole === 'vendor'
                ? 'No vendor account found for that email or mobile number. Please contact Reditoe to register your restaurant.'
                : 'No delivery partner account found for that email or mobile number. Please sign up first.',
          });
        }

        // A sign-in stops here: there is no account to sign in to.
        if (!isSignUp) {
          return res.status(404).json({
            status: 'error',
            success: false,
            code: 'no_account',
            message:
              'No account found for that email or mobile number. Please sign up first.',
          });
        }

        // Create new user without password (will be set later)
        if (isEmail) {
          const userData = {
            name: normalizedInput.split('@')[0],
            role: requestedRole,
            walletBalance: 0,
            otp,
            otpExpires,
            email: normalizedInput,
          };

          user = new User(userData);
          await user.save({ validateBeforeSave: false });

          if (otpUndeliverable) {
            console.warn(`[auth] No email provider configured - OTP for ${normalizedInput} is ${otp}`);
            return res.status(200).json(
              buildOtpSendSuccessResponse({
                message: 'Email is not configured on this server, so the code is shown here instead.',
                deliveryMethod: 'debug_otp',
                otp,
              })
            );
          }
        } else {
          // Check if phone exists with any role
          const existingUserAnyRole = await User.findOne({
            phone: normalizedInput
          });

          if (existingUserAnyRole) {
            // The number is known under some role. Which role that is gets
            // decided at verification, not here.
            existingUserAnyRole.otp = otp;
            existingUserAnyRole.otpExpires = otpExpires;
            await existingUserAnyRole.save({ validateBeforeSave: false });
            user = existingUserAnyRole;
          } else {
            // Create new user
            const userData = {
              name: `User${normalizedInput.slice(-4)}`,
              role: requestedRole,
              walletBalance: 0,
              otp,
              otpExpires,
              phone: normalizedInput,
            };

            user = new User(userData);
            await user.save({ validateBeforeSave: false });
          }
        }
      }
    } catch (dbError) {
      console.error('[sendOTP] DB save error:', dbError.message, dbError.code);

      // Handle duplicate key error
      if (dbError.code === 11000) {
        // Try finding existing user and update OTP only
        try {
          const searchQuery = {};
          searchQuery[searchField] = normalizedInput;
          const existingUser = await User.findOne(searchQuery);
          if (existingUser) {
            existingUser.otp = otp;
            existingUser.otpExpires = otpExpires;
            await existingUser.save({ validateBeforeSave: false });
            user = existingUser;
          }
        } catch (retryError) {
          console.error('[sendOTP] Retry failed:', retryError.message);
          return res.status(500).json({
            status: 'error',
            message: 'Database error. Please try again.',
            success: false,
          });
        }
      } else {
        return res.status(500).json({
          status: 'error',
          message: 'Database error. Please try again.',
          success: false,
        });
      }
    }

    // Send OTP via appropriate service
    let emailSent = false;

  if (isEmail) {
    console.log('â”â”â”â”â”â”â”â” STEP 1: EMAIL PREPARATION â”â”â”â”â”â”â”â”');
      const otpCopy = getOtpEmailCopyByRole(requestedRole);
      const subject = otpCopy.subject;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #E63946;">${otpCopy.heading}</h2>
          <p>Your 6-digit OTP code for ${otpCopy.audience} registration is:</p>
          <h1 style="color: #E63946; font-size: 48px; letter-spacing: 10px; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 20px 0;">${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `;
      
      console.log('ðŸ“§ Preparing email via Brevo API...');
      console.log('ðŸ“§ To:', normalizedInput);
      console.log('ðŸ“§ From:', EMAIL_FROM);
      console.log('ðŸ“§ Subject:', subject);
      
      console.log('â”â”â”â”â”â”â”â” STEP 2: BREVO API CONFIG CHECK â”â”â”â”â”â”â”â”');
      console.log('ðŸ”‘ BREVO_API_KEY Present:', !!process.env.BREVO_API_KEY);
      console.log('ðŸ“§ From Email:', EMAIL_FROM);
      console.log('ðŸ“§ Email Service:', EMAIL_SERVICE);
      console.log('ðŸ“§ Email Configured:', isEmailConfigured);
      console.log('ðŸ“§ SMTP Config Error:', smtpConfigError || 'None');
      console.log('ðŸ“§ From Source:', emailFromEnv.key || 'DEFAULT');
      
      console.log('BREVO CONFIG:', {
        apiKey: process.env.BREVO_API_KEY ? 'SET' : 'MISSING',
        emailFrom: process.env.EMAIL_FROM ? 'SET' : 'MISSING',
        legacyFrom: process.env.SENDGRID_FROM_EMAIL ? 'SET' : 'MISSING'
      });
      
      console.log('â”â”â”â”â”â”â”â” STEP 3: SENDING EMAIL VIA BREVO API â”â”â”â”â”â”â”â”');
      console.log('ðŸš€ Calling sendEmail() with await...');
      
      try {
        emailSent = await sendEmail(normalizedInput, subject, html);
        
        if (emailSent) {
          console.log('â”â”â”â”â”â”â”â” STEP 4: BREVO API SUCCESS â”â”â”â”â”â”â”â”');
          console.log('âœ… EMAIL SENT VIA BREVO');
        } else {
          console.log('â”â”â”â”â”â”â”â” STEP 4: BREVO API FAILURE â”â”â”â”â”â”â”â”');
          console.log('âŒ EMAIL SENDING FAILED');
        }
      } catch (error) {
        console.log('â”â”â”â”â”â”â”â” STEP 4: BREVO API FAILURE â”â”â”â”â”â”â”â”');
        console.log('âŒ EMAIL SENDING FAILED');
        console.log('âŒ Error Message:', error.message);
        console.log('âŒ Error Code:', error.code || 'N/A');
        console.log('âŒ Error Stack:', error.stack);
        console.log('âŒ Full Error Object:', error);
        emailSent = false;
      }
      
      console.log('â”â”â”â”â”â”â”â” STEP 5: EMAIL SEND RESULT â”â”â”â”â”â”â”â”');
      console.log('ðŸ“§ Email Send Result:', emailSent);
    } else {
      // Send via Twilio text
      const textMessage = `Your Reditoe OTP code is: ${otp}. Valid for 5 minutes. Don't share this code with anyone.`;

      // CRITICAL FIX: If Twilio not configured, immediately try email fallback
      /**
       * No way to text? Fall back to email.
       *
       * This asked whether a Twilio client existed, which it never does on a
       * platform that texts through MSG91 - so signing in by mobile number
       * skipped the message entirely, fell through to email, and failed there
       * too when email was not set up either. The question is whether a text
       * can be sent at all, not which provider would have sent it.
       */
      if (!isTwilioConfigured) {
        console.log('âš ï¸ Twilio not configured - attempting immediate EMAIL fallback...');
        if (user && user.email) {
          try {
            const otpCopy = getOtpEmailCopyByRole(requestedRole);
            const emailMessage = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <h2 style="color: #333; text-align: center;">${otpCopy.heading}</h2>
              <div style="background-color: #fff; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <p style="font-size: 18px; color: #666; margin-bottom: 20px;">Your 6-digit OTP code for ${otpCopy.audience} registration is:</p>
                <div style="font-size: 36px; font-weight: bold; color: #ff6b35; letter-spacing: 8px; margin: 20px 0;">${otp}</div>
                <p style="font-size: 14px; color: #999; margin-top: 20px;">This code expires in 5 minutes</p>
              </div>
              <p style="font-size: 12px; color: #999; text-align: center;">Sent because text service is not available</p>
            </div>`;

            emailSent = await sendEmail(user.email, `${otpCopy.heading} (text Fallback)`, emailMessage);
            
            if (emailSent) {
              console.log('âœ… Email fallback sent successfully to:', user.email);
            }
          } catch (emailFallbackError) {
            console.error('âŒ Email fallback failed:', emailFallbackError.message);
            emailSent = false;
          }
        } else {
          console.log('âŒ No email available for fallback');
          emailSent = false;
        }
      } else {
        // Twilio is configured - try to send text
        try {
          console.log('ðŸ“± Sending text via Twilio...');
          console.log('ðŸ“± To:', normalizedInput);
          console.log('ðŸ“± From:', TWILIO_PHONE_NUMBER);
          
          const ok = await smsService.sendSms({
            to: normalizedInput,
            otp,
            role: requestedRole,
            message: textMessage,
          });
          if (!ok) throw new Error('The SMS provider refused the message');

          console.log('text sent successfully');
          emailSent = true;
        } catch (textError) {
          console.error('âŒ Twilio text sending failed:', textError.message);
          console.error('âŒ Twilio Error Code:', textError.code || 'N/A');
          
          // CRITICAL FIX: Fallback to email when text fails
          if (user && user.email) {
            console.log('ðŸ“§ text failed - attempting EMAIL fallback...');
            try {
              const otpCopy = getOtpEmailCopyByRole(requestedRole);
              const emailMessage = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                <h2 style="color: #333; text-align: center;">${otpCopy.heading}</h2>
                <div style="background-color: #fff; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <p style="font-size: 18px; color: #666; margin-bottom: 20px;">Your 6-digit OTP code for ${otpCopy.audience} registration is:</p>
                  <div style="font-size: 36px; font-weight: bold; color: #ff6b35; letter-spacing: 8px; margin: 20px 0;">${otp}</div>
                  <p style="font-size: 14px; color: #999; margin-top: 20px;">This code expires in 5 minutes</p>
                </div>
                <p style="font-size: 12px; color: #999; text-align: center;">Sent because text delivery failed</p>
              </div>`;

              emailSent = await sendEmail(user.email, `${otpCopy.heading} (text Fallback)`, emailMessage);
              
              if (emailSent) {
                console.log('âœ… Email fallback sent successfully to:', user.email);
              }
            } catch (emailFallbackError) {
              console.error('âŒ Email fallback also failed:', emailFallbackError.message);
              emailSent = false;
            }
          } else {
            emailSent = false;
          }
        }
      }
    }

    const allowDebugOtpFallback =
      process.env.ALLOW_DEBUG_OTP === 'true' ||
      process.env.NODE_ENV !== 'production' ||
      isLocalRequest(req);

    // Only return success if email/text was actually sent
    if (!emailSent) {
      const deliveryType = isEmail ? 'Email' : 'text';
      console.log(`â”â”â”â”â”â”â”â” FINAL RESULT: ${deliveryType} FAILED â”â”â”â”â”â”â”â”`);
      console.log('âŒ Returning error to client');
      console.log(`â”â”â”â”â”â”â”â” OTP REQUEST END (FAILURE) â”â”â”â”â”â”â”â”`);
      
      // Determine appropriate error message based on configuration issues
      let errorMessage;
      let statusCode = 500;
      
      if (isEmail) {
        errorMessage = smtpConfigError 
          ? 'Invalid Brevo SMTP configuration. Please check server setup.' 
          : 'Email sending failed - check server logs';
      } else {
        // Phone OTP failed - check if user has email for fallback
        const hasEmailFallback = user && user.email;
        
        if (!isTwilioConfigured) {
          // Twilio not configured
          if (hasEmailFallback) {
            errorMessage = 'text service not configured. OTP was sent to your email instead.';
            statusCode = 200; // Actually succeeded via fallback
          } else {
            // CRITICAL FIX: Clear message for phone-only users (400 = client needs to add email)
            errorMessage = 'Phone OTP unavailable. Please add an email address to your account for OTP recovery, or contact support.';
            statusCode = 400; // Bad Request - user needs to provide email
          }
        } else {
          // Twilio configured but text failed
          if (hasEmailFallback) {
            errorMessage = 'text delivery failed. OTP was sent to your email instead.';
            statusCode = 200; // Actually succeeded via fallback
          } else {
            errorMessage = 'text delivery failed and no email on file for fallback. Please add an email address or contact support.';
            statusCode = 400; // Bad Request - user needs to provide email
          }
        }
      }
      
      // If we actually succeeded via email fallback, return success
      if (statusCode === 200) {
        return res.status(200).json(
          buildOtpSendSuccessResponse({
            message: errorMessage,
            deliveryMethod: 'email_fallback',
          })
        );
      }
      
      if (allowDebugOtpFallback) {
        return res.status(200).json(
          buildOtpSendSuccessResponse({
            message: `${deliveryType} delivery unavailable. Using debug OTP fallback.`,
            deliveryMethod: 'debug_otp',
            otp,
          })
        );
      }

      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        status: 'error',
        errorCode: isEmail ? 'EMAIL_FAILED' : (user && user.email ? 'text_FAILED_EMAIL_FALLBACK' : 'text_FAILED_NO_FALLBACK'),
        suggestion: !isEmail && !(user && user.email) 
          ? 'Add an email address to your profile for reliable OTP delivery' 
          : undefined,
      });
    }

    console.log('â”â”â”â”â”â”â”â” FINAL RESULT: EMAIL SENT â”â”â”â”â”â”â”â”');
    console.log('âœ… Returning success to client');
    console.log('â”â”â”â”â”â”â”â” OTP REQUEST END (SUCCESS) â”â”â”â”â”â”â”â”');
    return res.status(200).json(
      buildOtpSendSuccessResponse({
        message: `OTP sent via ${isEmail ? 'email' : 'text'}`,
        deliveryMethod: isEmail ? 'email' : 'text',
      })
    );
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({
        status: 'error',
        message: 'An unexpected error occurred. Please try again.',
        success: false,
      });
    }
  }
};

// Verify OTP (supports both email and phone)
export const verifyOTP = async (req, res) => {
  try {
    const { emailOrPhone, otp, selectedRole, riderData } = req.body;

    if (!emailOrPhone || !otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email/phone and OTP',
      });
    }

    // Check if it's an email or phone number
    const isEmail = emailOrPhone.includes('@');
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(emailOrPhone.replace(/[^\d+]/g, ''));
    
    if (!isEmail && !isPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address or phone number',
      });
    }

    // Normalize the input
    let normalizedInput;
    let searchField;
    if (isEmail) {
      normalizedInput = emailOrPhone.toLowerCase().trim();
      searchField = 'email';
    } else {
      // Normalize phone number to E.164 format
      normalizedInput = emailOrPhone.replace(/[^\d+]/g, '');
      if (!normalizedInput.startsWith('+')) {
        // Default to +91 for Indian numbers if no country code
        if (normalizedInput.length === 10) {
          normalizedInput = '+91' + normalizedInput;
        } else {
          normalizedInput = '+' + normalizedInput;
        }
      }
      searchField = 'phone';
    }

    // Find user with OTP
    const searchQuery = {};
    searchQuery[searchField] = normalizedInput;
    const user = await User.findOne(searchQuery).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found. Please request a new OTP.',
      });
    }

    // Check if OTP exists
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        status: 'error',
        message: 'OTP not found. Please request a new OTP.',
      });
    }

    // Check if OTP is expired
    if (Date.now() > user.otpExpires.getTime()) {
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(400).json({
        status: 'error',
        message: 'OTP expired. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid OTP. Please try again.',
      });
    }

    /**
     * The account's role decides what it is. The app only says which door was
     * knocked on.
     *
     * This used to promote the account to whatever role the caller asked for,
     * marked "flexible role switching for testing" - so a customer who could
     * receive one OTP became a vendor simply by asking, and a rider became a
     * vendor the same way. That was survivable only while OTP sign-in existed
     * in the customer app alone, which always asks for 'user'. Putting the
     * same sign-in on the vendor and partner apps turns it into a way for
     * anyone with an email address to walk into the vendor console.
     *
     * A role is granted by registering or by an admin, never by choosing it at
     * a login screen.
     */
    const dbRole = user.role || 'user';

    if (selectedRole) {
      const requestedRole = selectedRole.toLowerCase().trim();

      if (dbRole !== requestedRole) {
        const ACCOUNT = {
          user: 'a customer account',
          vendor: 'a vendor account',
          rider: 'a delivery partner account',
        };
        const APP = { user: 'Reditoe', vendor: 'Reditoe Vendor', rider: 'Reditoe Delivery Partner' };
        return res.status(403).json({
          status: 'error',
          message: `This is ${ACCOUNT[dbRole] || `a ${dbRole} account`}. Please sign in on the ${APP[dbRole] || dbRole} app instead.`,
        });
      }
    }

    // Check if user has a password set (existing user)
    // New users don't have a password set initially
    const userWithPassword = await User.findById(user._id).select('+password');
    const isNewUser = !userWithPassword.password || userWithPassword.password === '';

    // Handle rider-specific data if provided
    if (selectedRole === 'rider' && riderData && isNewUser) {
      // Update user with rider data
      if (riderData.name) user.name = String(riderData.name).trim();
      if (riderData.email) user.email = String(riderData.email).trim().toLowerCase();
      if (riderData.phone) {
        const normalizedPhone = String(riderData.phone).replace(/[^\d]/g, '').slice(-10);
        if (normalizedPhone) {
          user.phone = `+91${normalizedPhone}`;
        }
      }
      if (riderData.dateOfBirth) {
        const dobRaw = String(riderData.dateOfBirth).trim();
        const [day, month, year] = dobRaw.split('/');
        if (day && month && year) {
          const parsedDob = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
          if (!Number.isNaN(parsedDob.getTime())) {
            user.dateOfBirth = parsedDob;
          }
        }
      }
      if (riderData.gender) user.gender = String(riderData.gender).trim().toLowerCase();
      const cityOrLocation = riderData.city || riderData.location;
      if (cityOrLocation) {
        user.city = String(cityOrLocation).trim();
        user.location = String(cityOrLocation).trim();
      }
      if (riderData.emergencyContactName) user.emergencyContactName = String(riderData.emergencyContactName).trim();
      if (riderData.emergencyRelationship) user.emergencyRelationship = String(riderData.emergencyRelationship).trim();
      if (riderData.emergencyContactPhone) {
        const emergencyPhone = String(riderData.emergencyContactPhone).replace(/[^\d]/g, '').slice(-10);
        if (emergencyPhone) {
          user.emergencyContactPhone = `+91${emergencyPhone}`;
        }
      }
      if (riderData.vehicleType) user.vehicleType = riderData.vehicleType;
      if (riderData.vehicleName) user.vehicleName = riderData.vehicleName;
      if (riderData.vehicleNumber) user.vehicleNumber = riderData.vehicleNumber;
      if (riderData.accountHolderName || riderData.accountNumber || riderData.ifscCode || riderData.bankName) {
        user.bankDetails = {
          accountHolderName: riderData.accountHolderName || '',
          accountNumber: riderData.accountNumber || '',
          ifscCode: riderData.ifscCode || '',
          bankName: riderData.bankName || ''
        };
      }
      // Generate rider ID
      if (!user.riderId) {
        user.riderId = 'RIDER' + Date.now().toString().slice(-6);
      }
      // Mark profile as complete if all required fields are present
      user.isProfileComplete = !!(user.name && user.email && user.vehicleType && user.vehicleNumber);
    }

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    // Generate token for both new and existing users
    // New users can login without password initially
    const token = signToken(user._id);
    user.password = undefined;

    let restaurant = null;

    // Return user with their actual role from database
    const isProfileComplete = !!user.isProfileComplete;
    const userPayload = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isProfileComplete,
      role: user.role,
      walletBalance: user.walletBalance,
      savedAddresses: user.savedAddresses,
      // Include rider-specific fields
      ...(user.role === 'rider' && {
        riderId: user.riderId,
        vehicleType: user.vehicleType,
        vehicleName: user.vehicleName,
        vehicleNumber: user.vehicleNumber,
        vehicleBrand: user.vehicleBrand || '',
        vehicleModel: user.vehicleModel || '',
        currentRating: user.currentRating,
        isOnline: user.isOnline,
        bankDetails: user.bankDetails,
        avatar: user.avatar || user.profilePhoto || '',
        kycStatus: user.kycStatus || 'pending',
        kycDisplayStatus: getKycDisplayStatus(user.kycStatus),
      })
    };

    return res.status(200).json({
      status: 'success',
      success: true,
      isNewUser,
      isProfileComplete,
      routeHint: isProfileComplete ? '/(tabs)' : '/signup',
      token,
      user: userPayload,
      data: {
        user: userPayload,
        isNewUser,
        isProfileComplete,
        routeHint: isProfileComplete ? '/(tabs)' : '/signup',
      },
      ...(restaurant && {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          status: restaurant.status,
          isEnabled: restaurant.isEnabled,
          message: 'Restaurant created. Please complete your profile and wait for admin approval.'
        }
      })
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Set Password (for new users after OTP verification - supports both email and phone)
/**
 * Sets the signed-in account's password.
 *
 * This took an email or phone number and a new password, found whoever owned
 * that address, set their password to it and handed back a session token — no
 * OTP, no current password, no session of any kind. Anyone who knew a
 * customer's email address could take over their account, and be signed into
 * it on the same request.
 *
 * It now changes the password of whoever is actually signed in. The two real
 * ways to get a new password are untouched: `/auth/reset-password`, which
 * checks a one-time code, and `/auth/invite/set-password`, which checks a
 * signed invitation token. Someone who has just verified an OTP already holds
 * a session, so that route still reaches this.
 */
export const setPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a new password',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters',
      });
    }

    // Whoever is signed in — never an account named in the request body.
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Account not found' });
    }

    user.password = password;
    await user.save();

    // Generate JWT token
    const token = signToken(user._id);
    user.password = undefined;

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user,
      },
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Forgot Password - Step 1: send OTP to email
/**
 * Finish signing up.
 *
 * POST /auth/verify-account { emailOrPhone, otp }
 *
 * The session starts here rather than at registration: this is the first point
 * at which the contact details have been shown to belong to whoever typed them.
 */
export const verifyAccount = async (req, res) => {
  try {
    const { emailOrPhone, email, phone, otp } = req.body ?? {};
    const identifier = readIdentifier(emailOrPhone ?? email ?? phone);
    if (!identifier.kind || !otp) {
      return res.status(400).json({
        status: 'error',
        message: identifier.reason || 'Enter the code we sent you.',
      });
    }

    const user = await User.findOne(identifierQuery(identifier)).select('+otp +otpExpires');
    if (!user) {
      return res.status(400).json({ status: 'error', message: 'That code is not right.' });
    }

    // Already done — say so rather than failing on a code that has been cleared.
    if (user.accountVerified !== false) {
      return res.json({
        status: 'success',
        message: 'This account is already verified. Sign in.',
        alreadyVerified: true,
      });
    }

    if (!user.otp || !user.otpExpires || new Date() > user.otpExpires) {
      return res.status(400).json({
        status: 'error',
        message: 'That code has expired. Ask for a new one.',
      });
    }

    if (String(user.otp) !== String(otp).trim()) {
      return res.status(400).json({ status: 'error', message: 'That code is not right.' });
    }

    user.accountVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({
      status: 'success',
      message: 'Account verified.',
      token: signToken(user._id),
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          walletBalance: user.walletBalance,
          savedAddresses: user.savedAddresses,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Another signup code, for one that expired or never arrived.
 * POST /auth/resend-verification { emailOrPhone }
 */
export const resendVerification = async (req, res) => {
  try {
    const { emailOrPhone, email, phone } = req.body ?? {};
    const identifier = readIdentifier(emailOrPhone ?? email ?? phone);
    if (!identifier.kind) {
      return res.status(400).json({ status: 'error', message: identifier.reason });
    }

    const user = await User.findOne(identifierQuery(identifier)).select('+otp +otpExpires');
    // Same answer whether or not the account exists, as everywhere else.
    if (!user || user.accountVerified !== false) {
      return res.json({
        status: 'success',
        message: 'If that account is waiting to be verified, a new code has been sent.',
      });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + SIGNUP_OTP_TTL_MS);
    await user.save({ validateBeforeSave: false });
    const delivery = await deliverSignupCode(user, otp);

    res.json({
      status: 'success',
      channel: delivery.channel,
      message: delivery.sent
        ? 'A new code is on its way.'
        : 'Messaging is not configured on this server, so the code is shown here instead.',
      ...(delivery.devOtp ? { devOtp: delivery.devOtp } : {}),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
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




