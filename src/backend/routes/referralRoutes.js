import express from 'express';
import { protect } from '../middleware/auth.js';
import { adminProtect } from '../middleware/adminAuth.js';
import {
  getReferrals,
  getReferralSummary,
} from '../controllers/admin/adminReferralController.js';
import {
  getMyReferralDashboard,
  applyMyReferralCode,
  getOrCreateMyReferralProfile,
  validateReferralCode,
  processReferralReward,
  createMyReferralInvite,
  getMyReferralInvites,
} from '../controllers/user/referralController.js';

const router = express.Router();

// GET /api/referral/validate/:code - Validate referral code (no auth required)
router.get('/validate/:code', validateReferralCode);

// POST /api/referral/process-reward - Process referral reward (internal use)
router.post('/process-reward', processReferralReward);

// Shareable HTTPS referral link. It opens the target app deep-link when installed.
router.get('/open/:code', async (req, res) => {
  try {
    const { ReferralInvite } = await import('../models/ReferralInvite.js');
    const invite = await ReferralInvite.findOne({ code: String(req.params.code || '').trim().toUpperCase() }).lean();
    if (!invite) return res.status(404).send('Referral link not found');
    const schemes = { user: 'reditoe', vendor: 'reditoevendor', delivery_partner: 'reditoerider' };
    const route = invite.targetType === 'user' ? 'signin' : 'signup';
    const deepLink = `${schemes[invite.targetType]}://${route}?ref=${encodeURIComponent(invite.code)}`;
    res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${deepLink}"><title>Reditoe Referral</title></head><body><p>Opening Reditoe…</p><script>location.replace(${JSON.stringify(deepLink)});</script></body></html>`);
  } catch (error) {
    res.status(500).send('Could not open referral link');
  }
});

/*
 * Admin listing. Declared before `router.use(protect)` because that middleware
 * resolves a customer session — an admin token wouldn't survive it. These carry
 * their own admin guard instead.
 */
router.get('/', adminProtect, getReferrals);
router.get('/summary', adminProtect, getReferralSummary);

// All other routes require authentication
router.use(protect);

router.get('/me', getOrCreateMyReferralProfile);
router.get('/dashboard', getMyReferralDashboard);
router.get('/invites', getMyReferralInvites);
router.post('/invites', createMyReferralInvite);
router.post('/apply', applyMyReferralCode);

export default router;
