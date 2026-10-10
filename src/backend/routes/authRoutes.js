import express from 'express';
import {
  checkSetupToken,
  setPasswordWithToken,
} from '../controllers/setPasswordController.js';
import { register, signup, login, googleLogin, getProfile, getMe, updateProfile, completeProfile, sendOTP, verifyOTP, setPassword, forgotPassword, verifyForgotOTP, resetPassword, emailStatus, serviceStatus,
  verifyAccount,
  resendVerification,
} from '../controllers/user/authController.js';
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

// Main authentication routes
router.post('/register', register);
router.post('/signup', signup); // Alias for backward compatibility
router.post('/login', login);
router.post('/google', googleLogin);

router.post('/send-otp', sendOTP);

router.post('/verify-otp', verifyOTP);
// Changing your own password, so it needs a session: without `protect` this
// set the password of whatever account the request body named.
router.post('/set-password', protect, setPassword);
// Finishing signup. The session starts at verification, not registration.
router.post('/verify-account', verifyAccount);
router.post('/resend-verification', resendVerification);

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
console.log('   - POST /login');
console.log('   - POST /send-otp');
console.log('   - POST /verify-otp');
console.log('   - GET /env-check (NEW)');
console.log('   - POST /test-email (NEW)');
console.log('   - GET /email-status');
console.log('   - GET /service-status');

export default router;
