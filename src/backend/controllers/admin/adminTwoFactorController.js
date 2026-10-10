import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as otp from 'otplib';
import QRCode from 'qrcode';
import User from '../../models/User.js';

/**
 * Two-step sign-in for the admin console.
 *
 * The console can move money and read every customer's details, so a password
 * alone is thin protection - especially one that has been sent over a chat
 * app. This adds a code from an authenticator on the admin's phone.
 *
 * Standard TOTP, so Microsoft Authenticator, Google Authenticator, Authy and
 * 1Password all work. Nothing here is tied to a particular app.
 */

const ISSUER = 'Reditoe Admin';

/** How long the half-finished login is good for between password and code. */
const CHALLENGE_TTL = '5m';

/**
 * A token that proves the password step was passed and nothing else.
 *
 * Deliberately not a session token: if it leaked it would let somebody finish
 * a sign-in they had already started, not skip straight into the console. The
 * `use` claim is what stops it being presented as an ordinary session.
 */
const signChallenge = (userId) =>
  jwt.sign({ id: String(userId), use: '2fa-challenge' }, process.env.JWT_SECRET, {
    expiresIn: CHALLENGE_TTL,
  });

const readChallenge = (token) => {
  const claims = jwt.verify(token, process.env.JWT_SECRET);
  if (claims.use !== '2fa-challenge') throw new Error('Not a sign-in challenge');
  return claims.id;
};

/** Ten codes, each usable once, in a shape that survives being written down. */
const makeRecoveryCodes = () =>
  Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

/**
 * POST /admin/auth/2fa/setup
 *
 * Produces a secret and its QR code, and stores it as *pending*. Nothing is
 * switched on here - the admin has to prove they can read a code from it
 * first, or a mis-scanned QR would lock them out of their own console.
 */
export const startTwoFactorSetup = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactor.secret +twoFactor.pending');
    if (!user) return res.status(404).json({ status: 'error', message: 'Admin not found' });

    if (user.twoFactor?.enabled) {
      return res.status(409).json({
        status: 'error',
        message: 'Two-step sign-in is already switched on for this account.',
      });
    }

    const secret = await otp.generateSecret();
    const uri = await otp.generateURI({ secret, label: user.email, issuer: ISSUER });
    const qr = await QRCode.toDataURL(String(uri), { margin: 1, width: 260 });

    user.twoFactor.pending = secret;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      status: 'success',
      data: {
        qr,
        // Shown so it can be typed in by hand where a camera will not focus.
        secret,
      },
    });
  } catch (error) {
    console.error('[2fa] setup failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not start setup.' });
  }
};

/**
 * POST /admin/auth/2fa/enable  { token }
 *
 * Proves the authenticator is working, switches it on, and returns the
 * recovery codes once and only once.
 */
export const enableTwoFactor = async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id).select(
      '+twoFactor.secret +twoFactor.pending +twoFactor.recoveryCodes'
    );
    if (!user) return res.status(404).json({ status: 'error', message: 'Admin not found' });

    const pending = user.twoFactor?.pending;
    if (!pending) {
      return res.status(409).json({
        status: 'error',
        message: 'Start setup again - there is nothing waiting to be confirmed.',
      });
    }

    const check = await otp.verify({ token: String(token || '').trim(), secret: pending });
    if (!check?.valid) {
      return res.status(400).json({
        status: 'error',
        message: 'That code is not right. Check the app and try the next one.',
      });
    }

    const codes = makeRecoveryCodes();
    user.twoFactor.secret = pending;
    user.twoFactor.pending = undefined;
    user.twoFactor.enabled = true;
    user.twoFactor.enrolledAt = new Date();
    user.twoFactor.recoveryCodes = await Promise.all(
      codes.map(async (code) => ({ hash: await bcrypt.hash(code, 10), usedAt: null }))
    );
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      status: 'success',
      message: 'Two-step sign-in is on.',
      data: {
        // The only time these are ever readable. They are stored hashed.
        recoveryCodes: codes,
      },
    });
  } catch (error) {
    console.error('[2fa] enable failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not switch it on.' });
  }
};

/**
 * POST /admin/auth/2fa/verify  { challenge, token }
 *
 * The second half of signing in. Accepts either a code from the app or one of
 * the recovery codes, and returns the session token the console has been
 * waiting for.
 */
export const verifyTwoFactor = async (req, res) => {
  try {
    const { challenge, token } = req.body;
    if (!challenge || !token) {
      return res.status(400).json({ status: 'error', message: 'Enter the 6-digit code.' });
    }

    let userId;
    try {
      userId = readChallenge(challenge);
    } catch {
      return res.status(401).json({
        status: 'error',
        code: 'CHALLENGE_EXPIRED',
        message: 'That took too long. Please enter your password again.',
      });
    }

    const user = await User.findById(userId).select(
      '+twoFactor.secret +twoFactor.recoveryCodes'
    );
    if (!user || user.role !== 'admin' || !user.twoFactor?.enabled) {
      return res.status(401).json({ status: 'error', message: 'Could not sign you in.' });
    }

    const entered = String(token).trim().toUpperCase();

    /**
     * Only a six-digit entry is offered to the authenticator check. otplib
     * throws on anything else rather than returning false, and a recovery
     * code - which is letters and a dash - was blowing that up before it ever
     * reached the comparison below, so recovery codes never worked at all.
     */
    const digits = entered.replace(/\D/g, '');
    let ok = false;
    if (digits.length === 6) {
      const check = await otp
        .verify({ token: digits, secret: user.twoFactor.secret })
        .catch(() => null);
      ok = Boolean(check?.valid);
    }

    /**
     * A recovery code is spent the moment it works. Marked used rather than
     * deleted so the count on screen still reflects how many were issued.
     */
    if (!ok) {
      for (const entry of user.twoFactor.recoveryCodes) {
        if (entry.usedAt) continue;
        if (await bcrypt.compare(entered, entry.hash)) {
          entry.usedAt = new Date();
          ok = true;
          break;
        }
      }
      if (ok) await user.save({ validateBeforeSave: false });
    }

    if (!ok) {
      return res.status(401).json({
        status: 'error',
        message: 'That code is not right. Codes change every 30 seconds - try the next one.',
      });
    }

    const session = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    const remaining = user.twoFactor.recoveryCodes.filter((c) => !c.usedAt).length;

    return res.status(200).json({
      status: 'success',
      token: session,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        recoveryCodesRemaining: remaining,
      },
    });
  } catch (error) {
    console.error('[2fa] verify failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not sign you in.' });
  }
};

/**
 * POST /admin/auth/2fa/disable  { password }
 *
 * The password is asked for again on purpose: an unlocked laptop should not
 * be enough to take the second step off the account.
 */
export const disableTwoFactor = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password +twoFactor.secret');
    if (!user) return res.status(404).json({ status: 'error', message: 'Admin not found' });

    if (!password || !(await user.comparePassword(password))) {
      return res.status(401).json({ status: 'error', message: 'That password is not right.' });
    }

    user.twoFactor.enabled = false;
    user.twoFactor.secret = undefined;
    user.twoFactor.pending = undefined;
    user.twoFactor.recoveryCodes = [];
    user.twoFactor.enrolledAt = null;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({ status: 'success', message: 'Two-step sign-in is off.' });
  } catch (error) {
    console.error('[2fa] disable failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not switch it off.' });
  }
};

/** GET /admin/auth/2fa - whether it is on, for the settings screen. */
export const twoFactorStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactor.recoveryCodes');
    return res.status(200).json({
      status: 'success',
      data: {
        enabled: Boolean(user?.twoFactor?.enabled),
        enrolledAt: user?.twoFactor?.enrolledAt ?? null,
        recoveryCodesRemaining: (user?.twoFactor?.recoveryCodes ?? []).filter((c) => !c.usedAt)
          .length,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Could not read the setting.' });
  }
};

export { signChallenge };
export default {
  startTwoFactorSetup,
  enableTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
  twoFactorStatus,
};
