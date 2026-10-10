import smsService from '../../services/smsService.js';

/**
 * What the API is actually wired up to.
 *
 * The console used to work this out from tick-boxes in the settings document,
 * which record what somebody switched on rather than what the server can do.
 * With live Razorpay keys, Brevo and MSG91 all working, every row still read
 * "Not configured" - a status screen that is wrong is worse than no status
 * screen, because it sends people hunting for a fault that is not there.
 *
 * Only ever booleans and provider names. A credential is never returned, and
 * the last four characters of the Razorpay key id are shown solely so an
 * admin can tell live keys from test ones at a glance.
 */

const has = (value) => Boolean(String(value ?? '').trim());

export const getIntegrationStatus = async (req, res) => {
  try {
    const razorpayId = String(process.env.RAZORPAY_KEY_ID ?? '').trim();
    const razorpayLive = razorpayId.startsWith('rzp_live_');

    const emailProvider = has(process.env.BREVO_API_KEY)
      ? 'Brevo'
      : has(process.env.SMTP_HOST)
        ? 'SMTP'
        : null;

    const smsConfigured = smsService.isSmsConfigured();

    return res.status(200).json({
      status: 'success',
      data: {
        razorpay: {
          configured: has(razorpayId) && has(process.env.RAZORPAY_KEY_SECRET),
          mode: !has(razorpayId) ? null : razorpayLive ? 'live' : 'test',
          // Enough to recognise which key, not enough to use it.
          keyEnding: razorpayId ? razorpayId.slice(-4) : null,
        },
        email: {
          configured: Boolean(emailProvider),
          provider: emailProvider,
          from: process.env.EMAIL_FROM ?? null,
        },
        sms: {
          configured: smsConfigured,
          provider: smsConfigured ? smsService.smsProvider() : null,
        },
        push: {
          configured: has(process.env.FIREBASE_CLIENT_EMAIL) && has(process.env.FIREBASE_PRIVATE_KEY),
          provider: has(process.env.FIREBASE_CLIENT_EMAIL) ? 'Firebase' : null,
        },
        maps: {
          configured: has(process.env.GOOGLE_MAPS_API_KEY) || has(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
          provider: 'Google Maps',
        },
        /**
         * The wallet is ours, not a third party - there is no key to hold, so
         * whether it is on really is a settings question.
         */
        wallet: { configured: true, provider: 'Reditoe' },
      },
    });
  } catch (error) {
    console.error('[integrations] status failed:', error?.message || error);
    return res
      .status(500)
      .json({ status: 'error', message: 'Could not read the integration status.' });
  }
};

export default { getIntegrationStatus };
