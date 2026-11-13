/**
 * What counts as a strong password for an admin account.
 *
 * Twelve characters or more, with a lowercase letter, an uppercase letter, a
 * digit and a symbol, and not something obvious. Returns a sentence saying
 * what is missing, or null when the password is acceptable.
 */
const COMMON = ['password', 'admin', 'reditoe', 'qwerty', 'letmein', '123456', 'welcome', 'iloveyou'];

export const adminPasswordProblem = (value) => {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 12) return 'The password must be at least 12 characters long.';
  if (!/[a-z]/.test(password)) return 'The password needs a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'The password needs an uppercase letter.';
  if (!/\d/.test(password)) return 'The password needs a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'The password needs a symbol such as ! @ # or ?.';
  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word))) {
    return 'The password is too easy to guess. Avoid common words.';
  }
  return null;
};
