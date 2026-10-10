/**
 * The restaurant compliance documents, in one place.
 *
 * The admin console lists seven; the API used to store five and track
 * verification for three, under two different naming schemes ("foodLicense"
 * on upload, "fssaiVerified" on approval). That mismatch is why the console's
 * Upload and Approve buttons could only ever work for part of the list.
 *
 * One canonical key per document now. The legacy names are still accepted on
 * the wire and mapped here, so existing callers keep working.
 */

/**
 * key      — canonical name, used in URLs and in `documentRecords`
 * label    — how the document is named to a person
 * legacy   — the `kycDocuments.*` field to mirror to, where one exists
 * flag     — the `documentVerificationStatus.*` boolean, where one exists
 * required — counts toward the restaurant's overall KYC state
 * expires  — carries an expiry date
 */
export const DOCUMENT_TYPES = [
  { key: 'fssai', label: 'FSSAI License', legacy: 'fssai', flag: 'fssaiVerified', required: true, expires: true },
  { key: 'pan', label: 'PAN Card', legacy: 'pan', flag: null, required: true, expires: false },
  { key: 'gst', label: 'GST Certificate', legacy: 'gst', flag: 'gstVerified', required: true, expires: false },
  { key: 'bank', label: 'Bank Passbook', legacy: 'cancelledCheque', flag: 'bankVerified', required: true, expires: false },
  { key: 'aadhaar', label: 'Aadhaar', legacy: 'aadhaar', flag: null, required: false, expires: false },
  { key: 'shop', label: 'Shop & Establishment Certificate', legacy: null, flag: null, required: false, expires: true },
  { key: 'fire', label: 'Fire NOC', legacy: null, flag: null, required: false, expires: true },
  { key: 'health', label: 'Health NOC', legacy: null, flag: null, required: false, expires: true },
];

const BY_KEY = new Map(DOCUMENT_TYPES.map((entry) => [entry.key, entry]));

/** What the upload endpoint used to be called, mapped onto the canonical key. */
const ALIASES = {
  foodLicense: 'fssai',
  cancelledCheque: 'bank',
  bankPassbook: 'bank',
  shopLicense: 'shop',
  fireNoc: 'fire',
  healthNoc: 'health',
};

/** The canonical document, from any name the API has ever accepted. */
export function resolveDocumentType(value) {
  if (!value) return null;
  const key = ALIASES[value] ?? value;
  return BY_KEY.get(key) ?? null;
}

export const DOCUMENT_KEYS = DOCUMENT_TYPES.map((entry) => entry.key);

/**
 * The restaurant's overall KYC state, from the documents on file.
 *
 * Rejecting one required document rejects the restaurant — that is the signal
 * a vendor needs to act on. Otherwise it is approved once every required
 * document is verified, under review while any has been filed, and pending
 * before anything arrives. `rejected` is deliberately not sticky: re-uploading
 * the document clears it, so a vendor can fix the problem without an admin
 * having to reset a flag by hand.
 */
export function deriveKycStatus(records) {
  const required = DOCUMENT_TYPES.filter((entry) => entry.required);
  const statusFor = (key) => {
    const record = records?.get ? records.get(key) : records?.[key];
    return record?.url ? record.status || 'pending' : null;
  };

  const states = required.map((entry) => statusFor(entry.key));

  if (states.some((state) => state === 'rejected')) return 'rejected';
  if (states.length > 0 && states.every((state) => state === 'verified')) return 'approved';

  const anyFiled = DOCUMENT_KEYS.some((key) => statusFor(key) !== null);
  return anyFiled ? 'under_review' : 'pending';
}
