/**
 * Admin forgot-password and reset-password. Isolated from authController.
 * Uses Amazon SES SMTP (same env as OTP). No changes to /api/auth/* or mobile app.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import User from '../../models/User.js';

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').trim();
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@reditoe.com';
const FRONTEND_URL = (process.env.ADMIN_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const RESET_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

let isEmailReady = false;
let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    isEmailReady = true;
  } catch (err) {  }
}

const GENERIC_MESSAGE = "If an admin account exists with this email, a password reset link has been sent.";

/**
 * POST /admin/forgot-password (public)
 * Body: { email }
 * Only sends email if user exists AND role === 'admin'. Response is always generic.
 */
export const adminForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide an email address',
      });
    }

    const user = await User.findOne({ email: trimmedEmail, role: 'admin' }).select('+resetPasswordToken +resetPasswordExpires');
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: GENERIC_MESSAGE,
      });
    }

    if (!isEmailReady) {
      return res.status(200).json({
        status: 'success',
        message: GENERIC_MESSAGE,
      });
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(plainToken, 12);
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + RESET_EXPIRY_MS);
    await user.save({ validateBeforeSave: false });

    const resetLink = `${FRONTEND_URL}/auth/reset-password?token=${plainToken}`;
    const mailOptions = {
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Reset your admin password',
      text: `You requested a password reset. Click the link below (valid for 30 minutes):\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
      html: `<p>You requested a password reset. Click the link below (valid for 30 minutes):</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, ignore this email.</p>`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      status: 'success',
      message: GENERIC_MESSAGE,
    });
  } catch (error) {
    res.status(200).json({
      status: 'success',
      message: GENERIC_MESSAGE,
    });
  }
};

/**
 * POST /admin/reset-password (public, token-validated)
 * Body: { token, newPassword }
 */
export const adminResetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide token and new password',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 8 characters long',
      });
    }

    const adminsWithReset = await User.find({
      role: 'admin',
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    let user = null;
    for (const u of adminsWithReset) {
      const match = await bcrypt.compare(token, u.resetPasswordToken || '');
      if (match) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset link. Please request a new one.',
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset. You can now log in with your new password.',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reset password',
    });
  }
};


/* ── Forgot password by one-time code ─────────────────────────────────── */

import crypto2 from 'crypto';
import { sendEmail } from '../../services/emailService.js';

/** How long a reset code is good for, and how soon another may be asked for. */
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;

/**
 * POST /admin/auth/forgot-password-otp  { email }
 *
 * Deliberately explicit about an unknown address.
 *
 * The customer flow answers the same way whether an account exists or not, so
 * nobody can use it to discover who has an account. This one says plainly
 * when there is no admin account, because the client asked for it and because
 * an owner staring at a screen that claims to have sent a code to an address
 * that does not exist has no way to tell a typo from a broken server.
 *
 * The trade is real: it confirms which addresses are admin accounts. It is
 * acceptable here only because the console is behind two-step sign-in, so
 * knowing the address is a long way from getting in.
 */
export const adminForgotPasswordOtp = async (req, res) => {
  try {
    const email = String(req.body?.email ?? req.body?.emailOrPhone ?? '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        status: 'error',
        message: 'Enter the email address of your admin account.',
      });
    }

    const user = await User.findOne({ email, role: 'admin' }).select(
      '+resetOTP +resetOTPExpiry +resetOTPAttempts +resetOTPSentAt'
    );

    if (!user) {
      return res.status(404).json({
        status: 'error',
        code: 'NO_ADMIN_ACCOUNT',
        message: 'No account found with this email address.',
      });
    }

    const sinceLast = user.resetOTPSentAt ? Date.now() - user.resetOTPSentAt.getTime() : Infinity;
    if (sinceLast < OTP_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_MS - sinceLast) / 1000);
      return res.status(429).json({
        status: 'error',
        message: `A code was just sent. Try again in ${wait} second${wait === 1 ? '' : 's'}.`,
        retryAfterSeconds: wait,
      });
    }

    const code = String(crypto2.randomInt(100000, 1000000));
    user.resetOTP = code;
    user.resetOTPExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.resetOTPAttempts = 0;
    user.resetOTPSentAt = new Date();
    user.resetOTPChannel = 'email';
    await user.save({ validateBeforeSave: false });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #E63946;">Reset your Reditoe admin password</h2>
        <p>Your verification code is:</p>
        <h1 style="color:#E63946;font-size:40px;letter-spacing:8px;text-align:center;">${code}</h1>
        <p>It expires in ${OTP_TTL_MS / 60000} minutes.</p>
        <p>If you did not ask for this, you can ignore this email — your password has not changed.</p>
      </div>`;

    const sent = await sendEmail(user.email, 'Reditoe admin password reset', html);

    if (!sent) {
      return res.status(502).json({
        status: 'error',
        message: 'The code could not be sent. Please try again in a moment.',
      });
    }

    return res.status(200).json({
      status: 'success',
      success: true,
      message: `A six-digit code has been sent to ${user.email}.`,
      channel: 'email',
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error('[admin reset] failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not send the code.' });
  }
};
