/**
 * Admin auth routes. Public: login, forgot-password, reset-password.
 * Protected: me, change-password.
 */
import express from 'express';
import { adminProtect } from '../../middleware/adminAuth.js';
import {
  adminLogin,
  adminMe,
  adminChangePassword,
  adminUpdateProfile,
  adminUploadProfileImage,
  uploadProfileImage,
} from '../../controllers/admin/adminAuthController.js';
import {
  adminForgotPassword,
  adminResetPassword,
  adminForgotPasswordOtp,
} from '../../controllers/admin/adminForgotPasswordController.js';
import {
  startTwoFactorSetup,
  enableTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
  twoFactorStatus,
} from '../../controllers/admin/adminTwoFactorController.js';

import rateLimit from 'express-rate-limit';

const router = express.Router();

/*
 * The API-wide limiter skips nothing under /admin, but a sign-in deserves a
 * tighter one of its own: ten wrong passwords or codes from one address in
 * fifteen minutes is a person mistyping, anything beyond is guessing.
 */
const adminSignInLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});
const adminRecoveryLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});

// ----- Public routes (no auth middleware) -----
const publicRouter = express.Router();
publicRouter.post('/login', adminSignInLimit, adminLogin);
publicRouter.post('/forgot-password', adminRecoveryLimit, adminForgotPassword);
/**
 * The console's reset flow, which asks for a code rather than emailing a link.
 * Unlike the customer equivalent it says plainly when there is no admin
 * account for an address - see the controller for why that trade is made.
 */
publicRouter.post('/forgot-password-otp', adminRecoveryLimit, adminForgotPasswordOtp);
publicRouter.post('/reset-password', adminRecoveryLimit, adminResetPassword);
/**
 * The second half of signing in, so it cannot sit behind adminProtect: the
 * caller has no session yet - that is the entire point of it.
 */
publicRouter.post('/2fa/verify', adminSignInLimit, verifyTwoFactor);

// ----- Protected routes (admin only) -----
const protectedRouter = express.Router();
protectedRouter.use(adminProtect);
protectedRouter.get('/me', adminMe);
protectedRouter.put('/profile', adminUpdateProfile);
protectedRouter.post('/profile/image', uploadProfileImage, adminUploadProfileImage);
protectedRouter.post('/change-password', adminChangePassword);

// Managing two-step sign-in, which needs a session already in hand.
protectedRouter.get('/2fa', twoFactorStatus);
protectedRouter.post('/2fa/setup', startTwoFactorSetup);
protectedRouter.post('/2fa/enable', enableTwoFactor);
protectedRouter.post('/2fa/disable', disableTwoFactor);

// Mount public and protected routers
router.use('/', publicRouter);
router.use('/', protectedRouter);

export default router;
