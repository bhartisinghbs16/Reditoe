/**
 * "Is this an email or a mobile number?"
 *
 * Sign-in, password reset and OTP all take one box the customer types into and
 * have to work out what they meant. Each used to decide that for itself, or
 * not at all — login only ever accepted an email, so a customer who registered
 * with their mobile could not get back in with it.
 *
 * Indian mobile numbers are the case that matters: ten digits starting 6-9,
 * with or without +91, with or without spaces or dashes. They are stored in
 * E.164 (+919812345678), so a lookup has to try the stored form and the bare
 * ten digits both — older records were saved without the country code.
 */

/** Ten digits beginning 6, 7, 8 or 9 — the ranges TRAI actually allocates. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Deliberately permissive: the address is proved by the OTP, not the regex. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads one typed value.
 *
 * Returns `{ kind, value, variants }` where `kind` is 'email' | 'phone', and
 * `variants` is every stored form the value could match, for use with $in.
 * Returns `{ kind: null, reason }` when it is neither.
 */
export function readIdentifier(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { kind: null, reason: 'Enter your email address or mobile number.' };

  if (raw.includes('@')) {
    const value = raw.toLowerCase();
    if (!EMAIL.test(value)) {
      return { kind: null, reason: 'That email address does not look right.' };
    }
    return { kind: 'email', value, variants: [value] };
  }

  const digits = raw.replace(/[^\d]/g, '');
  // Accept 9812345678, 919812345678 and +919812345678 as the same number.
  const local = digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;

  if (!INDIAN_MOBILE.test(local)) {
    return {
      kind: null,
      reason: 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.',
    };
  }

  return {
    kind: 'phone',
    value: `+91${local}`,
    // Every shape the number may have been stored in over the years.
    variants: [`+91${local}`, `91${local}`, local],
  };
}

/** A mongo filter matching a user by whichever field the identifier names. */
export function identifierQuery(identifier) {
  return identifier.kind === 'email'
    ? { email: identifier.value }
    : { phone: { $in: identifier.variants } };
}

/** True when the value is a usable Indian mobile number. */
export const isIndianMobile = (value) => readIdentifier(value).kind === 'phone';

/** True when the value is a usable email address. */
export const isEmailAddress = (value) => readIdentifier(value).kind === 'email';

/**
 * Password rules, in one place so signup, reset and the apps agree.
 *
 * Length does most of the work; the character classes stop "password" and
 * "12345678" without demanding something unmemorable.
 */
export function checkPasswordStrength(password) {
  const value = String(password ?? '');
  if (value.length < 8) return { ok: false, reason: 'Use at least 8 characters.' };
  if (!/[A-Za-z]/.test(value)) return { ok: false, reason: 'Include at least one letter.' };
  if (!/\d/.test(value)) return { ok: false, reason: 'Include at least one number.' };
  return { ok: true };
}
