import express from 'express';
import {
  checkSetupToken,
  setPasswordWithToken,
} from '../controllers/setPasswordController.js';
import {
  register,
  signup,
  login,
  googleLogin,
  getProfile,
  getMe,
  updateProfile,
  completeProfile,
  setPassword,
  forgotPassword,
  verifyForgotOTP,
  resetPassword,
  emailStatus,
  serviceStatus,
} from '../controllers/user/authController.js';
import { sendOtp, verifyOtp } from '../controllers/otpAuthController.js';
import rateLimit from 'express-rate-limit';
import { sendEmail } from '../services/emailService.js';
import { protect } from '../middleware/auth.js';
import { uploadProfilePhoto, handleUploadError } from '../middleware/uploadMiddleware.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

const requireDiagnosticsAccess = (req, res, next) => {
  if (!isProduction) return next();
  return res.status(404).json({
    status: 'error',
    message: 'Not found',
  });
};

const firstNonEmptyEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return { key: null, value: '' };
};

/**
 * Per network, on top of the per-number limits in the controller.
 *
 * The API-wide limiter skips /auth altogether, so without this a single address
 * could ask for codes to any number of different phones - which is what text
 * message abuse looks like - or guess at codes across any number of accounts.
 * Generous, because a mobile carrier puts a great many customers behind one
 * address; the per-number limits are the ones that protect an individual.
 */
const perNetwork = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'error',
      success: false,
      message: 'Too many attempts from this network. Please wait a few minutes and try again.',
    },
  });

/*
 * Signing in. There is one way - a mobile number and the one-time code sent to
 * it - and the same two calls serve the customer, vendor and delivery-partner
 * apps. A number with an account is signed in; a number without one is handed a
 * proof, which the app's sign-up screen trades for an account.
 */
router.post('/send-otp', perNetwork(60), sendOtp);
router.post('/verify-otp', perNetwork(120), verifyOtp);

// Creating a customer account, with the proof from verify-otp. Multipart: the
// profile photo travels with the details.
// The limit comes first: it is the multipart parse that writes the photo to
// disk, so a refused request must be refused before that happens.
router.post('/register', perNetwork(30), uploadProfilePhoto, handleUploadError, register);
router.post('/signup', perNetwork(30), uploadProfilePhoto, handleUploadError, signup); // Alias for backward compatibility

// Password and Google sign-in no longer exist. These answer 410 with a reason
// instead of falling through to "route not found".
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/set-password', setPassword);

router.post('/forgot-password', forgotPassword);

/**
 * Setting a password from an invitation link. No session: the token is the
 * credential, which is why it is single-use and expires.
 *
 * Namespaced under /invite because /set-password already belongs to the
 * OTP-based flow above — registering a second handler on that path silently
 * shadowed this one.
 */
router.get('/invite/:token', checkSetupToken);
router.post('/invite/set-password', setPasswordWithToken);
router.post('/verify-forgot-otp', verifyForgotOTP);
router.post('/reset-password', resetPassword);

// Diagnostics (safe): email and text transport status
router.get('/email-status', requireDiagnosticsAccess, emailStatus);
router.get('/service-status', requireDiagnosticsAccess, serviceStatus);

// Production environment diagnostic endpoint
router.get('/env-check', requireDiagnosticsAccess, (req, res) => {
  const emailFromEnv = firstNonEmptyEnv('EMAIL_FROM', 'SENDGRID_FROM_EMAIL', 'EMAIL_USER');
  
  // Check email configuration
  const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'brevo',
    brevoApiKey: process.env.BREVO_API_KEY ? 'SET' : 'MISSING',
    from: emailFromEnv.value || 'noreply@reditoe.com',
    sources: {
      brevoApiKey: process.env.BREVO_API_KEY ? 'BREVO_API_KEY' : 'MISSING',
      emailFrom: emailFromEnv.key || 'DEFAULT',
    },
  };
  
  const isEmailConfigured = !!(process.env.BREVO_API_KEY && emailFromEnv.value);
  
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    email: {
      configured: isEmailConfigured,
      config: emailConfig,
    },
    database: {
      uri: process.env.MONGODB_URI ? 'SET' : 'MISSING',
    },
    jwt: {
      secret: process.env.JWT_SECRET ? 'SET' : 'MISSING',
    },
    production: {
      url: process.env.RENDER_EXTERNAL_URL || process.env.PRODUCTION_URL || 'NOT SET',
    },
  });
});

// CRITICAL: Test email endpoint for debugging
router.post('/test-email', requireDiagnosticsAccess, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      status: 'error',
      message: 'Email address required in request body',
    });
  }
  
  const emailFromEnv = firstNonEmptyEnv('EMAIL_FROM', 'SENDGRID_FROM_EMAIL', 'EMAIL_USER');
  const EMAIL_FROM = emailFromEnv.value || 'noreply@reditoe.com';
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 TEST EMAIL ENDPOINT CALLED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Target Email:', email);
  console.log('📧 Brevo API Key:', process.env.BREVO_API_KEY ? 'SET' : 'NOT SET');
  console.log('📧 From:', EMAIL_FROM);
  console.log('📧 From Source:', emailFromEnv.key || 'DEFAULT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (!process.env.BREVO_API_KEY || !EMAIL_FROM) {
    return res.status(503).json({
      status: 'error',
      message: 'Brevo email API not configured',
      details: {
        brevoApiKey: process.env.BREVO_API_KEY ? 'SET' : 'MISSING',
        emailFrom: EMAIL_FROM ? 'SET' : 'MISSING',
      },
    });
  }
  
  try {
    console.log('📨 STEP 1: Sending test email via Brevo API...');
    const subject = 'Vinsta SMTP Test - ' + new Date().toISOString();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #E63946;">Vinsta Email API Test</h2>
        <p>This is a test email from Vinsta backend.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Provider:</strong> Brevo Email API</p>
        <p><strong>From:</strong> ${EMAIL_FROM}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          If you received this email, your Brevo email configuration is working correctly!
        </p>
      </div>
    `;
    
    const sent = await sendEmail(email, subject, html);
    if (!sent) {
      throw new Error('Brevo test email send failed');
    }
    
    console.log('✅ EMAIL SENT VIA BREVO');
    
    res.json({
      status: 'success',
      message: 'Test email sent successfully',
      details: {
        provider: 'brevo-api',
        accepted: [email],
      },
    });
  } catch (error) {
    console.error('❌ EMAIL SEND FAILED:', error.message);
    console.error('❌ Full Error:', error);
    console.error('❌ Error Code:', error.code);
    console.error('❌ Error Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to send test email',
      error: error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack,
    });
  }
});

// Protected routes
router.get('/profile', protect, getProfile);
router.get('/me', protect, getMe); // Alias for backward compatibility
router.put('/profile', protect, uploadProfilePhoto, handleUploadError, updateProfile);
router.post(
  '/complete-profile', 
  protect, 
  uploadProfilePhoto,
  handleUploadError,
  completeProfile
);

// Log registered routes for debugging
console.log('✅ Auth routes registered:');
console.log('   - POST /register');
console.log('   - POST /send-otp');
console.log('   - POST /verify-otp');
console.log('   - GET /env-check (NEW)');
console.log('   - POST /test-email (NEW)');
console.log('   - GET /email-status');
console.log('   - GET /service-status');

export default router;
