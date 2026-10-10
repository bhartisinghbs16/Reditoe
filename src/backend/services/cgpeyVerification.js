/**
 * CGPey identity verification.
 *
 * Used to verify vendors and delivery partners during onboarding: PAN, Aadhaar
 * (OKYC), bank account, GST and driving licence. Before this, documents were
 * uploaded and an admin approved them by eye — nothing checked that a PAN or a
 * bank account existed, or belonged to the person who typed it in.
 *
 * Two things shape the design:
 *
 *  1. Every call costs money. The account is billed per request — ₹1.77 for a
 *     PAN, ₹4.45 for a driving licence — whether or not the answer is useful.
 *     So callers must not re-verify what is already verified, and a failed
 *     request must never be retried blindly in a loop.
 *
 *  2. The dashboard login (email and password) is NOT what authenticates these
 *     calls. They need merchant API credentials — x-merchant-id, x-api-key and
 *     x-secret-key — which CGPey issues separately. Without them every call
 *     returns 400 "Missing required headers", so this reports that as an
 *     unconfigured integration rather than as a verification failure: the
 *     difference matters, one is our problem and the other is the applicant's.
 */

const BASE_URL = (process.env.CGPEY_BASE_URL || 'https://verify.cgpey.com').replace(/\/+$/, '');
const MERCHANT_ID = process.env.CGPEY_MERCHANT_ID || '';
const API_KEY = process.env.CGPEY_API_KEY || '';
const SECRET_KEY = process.env.CGPEY_SECRET_KEY || '';

/** How long to wait on the provider before giving up. */
const TIMEOUT_MS = Number(process.env.CGPEY_TIMEOUT_MS || 30000);

/**
 * The services this merchant account is actually assigned. Calling anything
 * else is rejected here rather than spending a request to be told no.
 */
export const SERVICES = {
  PAN: 'PAN_VERIFICATION',
  OKYC_INITIATE: 'OKYC_OTP_INITIATE',
  OKYC_VERIFY: 'OKYC_VERIFICATION',
  BANK: 'BANK_PENNYLESS_VERIFICATION',
  GST: 'GST_VERIFICATION',
  DRIVING_LICENCE: 'DRIVING_LICENCE',
};

/** Indicative cost per call, for the audit trail and for spend reporting. */
export const SERVICE_COST = {
  [SERVICES.PAN]: 1.77,
  [SERVICES.OKYC_INITIATE]: 0.99,
  [SERVICES.OKYC_VERIFY]: 3.08,
  [SERVICES.BANK]: 1.77,
  [SERVICES.GST]: 1.77,
  [SERVICES.DRIVING_LICENCE]: 4.45,
};

export function isConfigured() {
  return Boolean(MERCHANT_ID && API_KEY && SECRET_KEY);
}

/** Describes what is missing, for the admin screen and the startup log. */
export function configurationStatus() {
  const missing = [];
  if (!MERCHANT_ID) missing.push('CGPEY_MERCHANT_ID');
  if (!API_KEY) missing.push('CGPEY_API_KEY');
  if (!SECRET_KEY) missing.push('CGPEY_SECRET_KEY');
  return {
    configured: missing.length === 0,
    missing,
    baseUrl: BASE_URL,
    services: Object.values(SERVICES),
  };
}

export class VerificationError extends Error {
  constructor(message, { status = 502, code = 'VERIFICATION_FAILED', details = null } = {}) {
    super(message);
    this.name = 'VerificationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * One call to the provider.
 *
 * Returns the parsed body on success. On failure it throws rather than
 * returning a falsy result, because "could not check" and "checked, and it is
 * invalid" must not collapse into the same value — treating an outage as a
 * failed KYC would reject applicants for a fault at our end.
 */
async function call(path, body) {
  if (!isConfigured()) {
    const { missing } = configurationStatus();
    throw new VerificationError(
      `Identity verification is not configured. Missing ${missing.join(', ')}.`,
      { status: 503, code: 'NOT_CONFIGURED', details: { missing } }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-merchant-id': MERCHANT_ID,
        'x-api-key': API_KEY,
        'x-secret-key': SECRET_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError';
    throw new VerificationError(
      timedOut
        ? `The verification service did not respond within ${TIMEOUT_MS / 1000}s.`
        : 'Could not reach the verification service.',
      { status: 504, code: timedOut ? 'TIMEOUT' : 'UNREACHABLE' }
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    throw new VerificationError(
      payload?.message || `Verification failed (HTTP ${response.status})`,
      {
        status: response.status === 400 ? 400 : 502,
        code: response.status === 400 ? 'INVALID_INPUT' : 'PROVIDER_ERROR',
        details: payload?.error ?? null,
      }
    );
  }

  return payload?.data ?? payload;
}

/** PAN. `pan` is the ten-character number; `name` is checked against it. */
export function verifyPan({ pan, name, dob }) {
  return call('/verify/pan', {
    panNumber: String(pan || '').toUpperCase().trim(),
    name: name?.trim(),
    dob: dob || undefined,
    consent: 'Y',
  });
}

/**
 * Aadhaar is two steps: an OTP is sent to the number registered against it,
 * then the OTP plus the reference from step one returns the record. Only the
 * second step returns identity data, and each step is billed.
 */
export function initiateAadhaarOkyc({ aadhaar }) {
  return call('/verify/okyc/initiate', {
    aadhaarNumber: String(aadhaar || '').replace(/\s+/g, ''),
    consent: 'Y',
  });
}

export function verifyAadhaarOkyc({ requestId, otp }) {
  return call('/verify/okyc/verify', {
    requestId,
    otp: String(otp || '').trim(),
    consent: 'Y',
  });
}

/**
 * Bank account, without a penny drop — it checks the account exists and
 * returns the registered holder name, so the caller can compare it with the
 * applicant's own name.
 */
export function verifyBankAccount({ accountNumber, ifsc }) {
  return call('/verify/bank-pennyless', {
    accountNumber: String(accountNumber || '').trim(),
    ifsc: String(ifsc || '').toUpperCase().trim(),
    consent: 'Y',
  });
}

/** GST, for vendors registered for it. */
export function verifyGst({ gstNumber }) {
  return call('/verify/gst', {
    gstNumber: String(gstNumber || '').toUpperCase().trim(),
    consent: 'Y',
  });
}

/** Driving licence, for delivery partners. Needs the holder's date of birth. */
export function verifyDrivingLicence({ licenceNumber, dob }) {
  return call('/verify/driving_licence', {
    dlNumber: String(licenceNumber || '').toUpperCase().trim(),
    dob,
    consent: 'Y',
  });
}

export default {
  SERVICES,
  SERVICE_COST,
  isConfigured,
  configurationStatus,
  VerificationError,
  verifyPan,
  initiateAadhaarOkyc,
  verifyAadhaarOkyc,
  verifyBankAccount,
  verifyGst,
  verifyDrivingLicence,
};
