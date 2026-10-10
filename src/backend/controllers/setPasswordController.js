/**
 * Choosing a password from an invitation link.
 *
 * The two halves of the set-password page: one call to check the link is good
 * before drawing the form, and one to set the password. Neither requires a
 * session — the token in the link is the credential, which is why it is
 * single-use and short-lived.
 */

import User from '../models/User.js';
import { hashToken, sendSetupInvite } from '../services/accountInviteService.js';
import { checkPasswordStrength } from '../utils/identifier.js';

/** Same answer for expired, spent and never-existed. */
const DEAD_LINK = 'This link has expired or has already been used. Ask for a new one.';

const findByToken = (token) =>
  User.findOne({
    passwordSetupToken: hashToken(token),
    passwordSetupExpires: { $gt: new Date() },
  }).select('+passwordSetupToken +passwordSetupExpires +password');

/**
 * GET /auth/set-password/:token
 * Tells the page whether to draw the form, and who it is for.
 */
export const checkSetupToken = async (req, res) => {
  try {
    const user = await findByToken(req.params.token);
    if (!user) {
      return res.status(400).json({ status: 'error', valid: false, message: DEAD_LINK });
    }

    res.json({
      status: 'success',
      valid: true,
      data: {
        // Shown so the vendor can see which account they are setting up, and
        // that the email address is the one they will sign in with.
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /auth/set-password
 * Body: { token, password, confirmPassword }
 */
export const setPasswordWithToken = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body ?? {};
    if (!token || !password) {
      return res.status(400).json({ status: 'error', message: 'Choose a password.' });
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({ status: 'error', message: 'The two passwords do not match.' });
    }

    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return res.status(400).json({ status: 'error', message: strength.reason });
    }

    const user = await findByToken(token);
    if (!user) {
      return res.status(400).json({ status: 'error', message: DEAD_LINK });
    }

    // Assigned, not hashed here: the model's pre-save hook owns hashing, and
    // hashing twice produces a password nothing can match.
    user.password = password;
    user.passwordSetupToken = undefined;
    user.passwordSetupExpires = undefined;
    user.mustSetPassword = false;
    await user.save();

    res.json({
      status: 'success',
      message: 'Password set. You can sign in now.',
      data: { email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /admin/vendors/:id/resend-invite
 * A new link, because the old one expired or never arrived.
 */
export const resendVendorInvite = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      '+passwordSetupToken +passwordSetupExpires'
    );
    if (!user || user.role !== 'vendor') {
      return res.status(404).json({ status: 'error', message: 'Vendor not found' });
    }
    if (!user.mustSetPassword) {
      return res.status(409).json({
        status: 'error',
        message: 'This vendor has already set a password. Send them a password reset instead.',
      });
    }

    const result = await sendSetupInvite({ user, subject: 'Your Reditoe set-password link' });
    res.json({
      status: 'success',
      message: result.sent
        ? `A new link has been emailed to ${user.email}.`
        : 'Email is not configured on this server, so the link is returned here.',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};
