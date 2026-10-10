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

const router = express.Router();

// ----- Public routes (no auth middleware) -----
const publicRouter = express.Router();
publicRouter.post('/login', adminLogin);
publicRouter.post('/forgot-password', adminForgotPassword);
/**
 * The console's reset flow, which asks for a code rather than emailing a link.
 * Unlike the customer equivalent it says plainly when there is no admin
 * account for an address - see the controller for why that trade is made.
 */
publicRouter.post('/forgot-password-otp', adminForgotPasswordOtp);
publicRouter.post('/reset-password', adminResetPassword);
/**
 * The second half of signing in, so it cannot sit behind adminProtect: the
 * caller has no session yet - that is the entire point of it.
 */
publicRouter.post('/2fa/verify', verifyTwoFactor);

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
