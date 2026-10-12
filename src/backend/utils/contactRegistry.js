/**
 * "Does anyone already hold this email address or mobile number?"
 *
 * A contact detail belongs to one account on this platform, whichever role it
 * was registered under: customer, vendor, delivery partner or admin all live
 * in the one users collection, and a number or address that is in use there
 * cannot be registered again under another role.
 *
 * Every place that creates an account, or hands one a new email or number,
 * asks through here so they all give the same answer. They previously each
 * asked for themselves, and disagreed:
 *
 *   - the vendor sign-up matched `phone` against the raw string the app sent,
 *     which never equals the stored +91 form, so a number already in use looked
 *     free;
 *   - the rider sign-up did the same with the bare ten digits;
 *   - the vendor sign-up, finding any account at all, turned it into a vendor.
 *
 * Only email is unique in the database. Mobile numbers are saved in several
 * shapes (+919812345678, 919812345678, 9812345678), so uniqueness for them is
 * enforced here, by comparing every shape.
 */
import User from '../models/User.js';
import { readIdentifier } from './identifier.js';

/**
 * Matches a stored mobile number in any of the forms it has been saved in.
 * Anchored, so a different number that merely ends in the same digits does not.
 */
const storedPhone = (local) => new RegExp(`^(?:\\+?91)?0?${local}$`);

/**
 * Looks across every role for an account already using these contact details.
 *
 * Either detail may be omitted, and a value that is not a usable email or
 * Indian mobile number is ignored rather than rejected: validating it is the
 * caller's job, this only answers who holds it.
 *
 * `exceptUserId` leaves one account out, for an account changing its own
 * details.
 *
 * Returns null when both are free. Otherwise `{ fields, asked, holders }`:
 * `fields` is which of the two clashed, `asked` is which were checked at all,
 * and `holders` are the accounts concerned (id, email, phone, role) - for the
 * caller's decisions, never for sending back to a stranger.
 */
export async function findContactHolders({ email, phone } = {}, { exceptUserId } = {}) {
  const emailId = email ? readIdentifier(email) : null;
  const phoneId = phone ? readIdentifier(phone) : null;
  const askedEmail = emailId?.kind === 'email';
  const askedPhone = phoneId?.kind === 'phone';
  if (!askedEmail && !askedPhone) return null;

  const phonePattern = askedPhone ? storedPhone(phoneId.value.slice(-10)) : null;

  const filter = {
    $or: [
      ...(askedEmail ? [{ email: emailId.value }] : []),
      ...(askedPhone ? [{ phone: phonePattern }] : []),
    ],
  };
  if (exceptUserId) filter._id = { $ne: exceptUserId };

  const holders = await User.find(filter).select('email phone role').limit(10).lean();
  if (!holders.length) return null;

  const fields = [];
  if (askedEmail && holders.some((holder) => holder.email === emailId.value)) {
    fields.push('email');
  }
  if (askedPhone && holders.some((holder) => phonePattern.test(String(holder.phone ?? '')))) {
    fields.push('phone');
  }

  return {
    fields,
    asked: [...(askedEmail ? ['email'] : []), ...(askedPhone ? ['phone'] : [])],
    holders,
  };
}

/**
 * The refusal for a clash, in one wording for every app.
 *
 * Deliberately says nothing about which role holds the detail, or who: the
 * caller is usually somebody who has not proved they own it, and "this number
 * is a vendor called so-and-so" is not theirs to learn.
 *
 * The code keeps the field-specific values the API has always used when only
 * one detail clashed.
 */
export function alreadyRegisteredBody({ fields }) {
  const both = fields.length > 1;
  const what = both
    ? 'mobile number and email ID already exist'
    : fields[0] === 'phone'
      ? 'mobile number already exists'
      : 'email ID already exists';

  return {
    status: 'error',
    success: false,
    code: both ? 'ALREADY_REGISTERED' : fields[0] === 'phone' ? 'PHONE_ALREADY_EXISTS' : 'EMAIL_ALREADY_EXISTS',
    fields,
    message: `Already Registered: this ${what}.`,
  };
}

/**
 * Which detail a MongoDB duplicate-key error is about, or null when it is
 * some other unique field. For the race where two requests pass the check
 * above together and one loses at the database.
 */
export function duplicateContactFields(error) {
  if (error?.code !== 11000) return null;
  const keys = Object.keys(error.keyPattern ?? {});
  const fields = ['email', 'phone'].filter((field) => keys.includes(field));
  return fields.length ? fields : null;
}
