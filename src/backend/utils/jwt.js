import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// CRITICAL: JWT_SECRET must be set in production
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate fingerprint for JWT secret (hash only, not the secret itself)
const generateSecretFingerprint = () => {
  const secret = JWT_SECRET || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';
  return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
};

// Generate fingerprint for token (for comparison)
const generateTokenFingerprint = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded && decoded.header && decoded.payload) {
      const headerPayload = JSON.stringify(decoded.header) + JSON.stringify(decoded.payload);
      return crypto.createHash('sha256').update(headerPayload).digest('hex').substring(0, 16);
    }
  } catch (error) {
    console.log('[TOKEN] Failed to generate token fingerprint:', error.message);
  }
  return null;
};

// Log server startup with JWT secret fingerprint
const JWT_SECRET_FINGERPRINT = generateSecretFingerprint();
console.log(`[JWT] Server started with secret fingerprint: ${JWT_SECRET_FINGERPRINT}`);
console.log(`[JWT] Environment mode: ${process.env.NODE_ENV || 'development'}`);

let _jwtWarned = false;
if (!JWT_SECRET) {
  if (!_jwtWarned) {
    _jwtWarned = true;
    console.warn('⚠️  JWT_SECRET not set. Set in .env for production.');
    if (process.env.NODE_ENV === 'production') {
      console.error('   Production cannot proceed without JWT_SECRET.');
      process.exit(1);
    }
    console.warn('   Using default secret for development only.');
  }
}

const JWT_SECRET_FINAL = JWT_SECRET || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';

export const signToken = (id) => {
  const token = jwt.sign({ id }, JWT_SECRET_FINAL, {
    expiresIn: JWT_EXPIRES_IN,
  });
  console.log(`[TOKEN] token-issued for user ID: ${id}`);
  return token;
};

export const verifyToken = (token) => {
  const tokenFingerprint = generateTokenFingerprint(token);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);
    return decoded;
  } catch (error) {
    // Enhanced logging for debugging
    console.log(`[TOKEN] token-verification-failed:`);
    console.log(`  - token fingerprint: ${tokenFingerprint}`);
    console.log(`  - server secret fingerprint: ${JWT_SECRET_FINGERPRINT}`);
    console.log(`  - environment mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  - error type: ${error.name}`);
    console.log(`  - error message: ${error.message}`);
    
    if (error.name === 'JsonWebTokenError') {
      console.log(`[TOKEN] secret-mismatch detected`);
    } else if (error.name === 'TokenExpiredError') {
      console.log(`[TOKEN] token-expired`);
    } else if (error.name === 'NotBeforeError') {
      console.log(`[TOKEN] token-not-active`);
    }
    
    throw error;
  }
};

// Export utility functions for frontend validation
export const getSecretFingerprint = () => JWT_SECRET_FINGERPRINT;
export const getTokenFingerprint = generateTokenFingerprint;
