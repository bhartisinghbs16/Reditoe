/**
 * The documents a delivery partner has to file, in one place.
 *
 * Riders stored theirs as four bare URLs on `kycDocuments`, with no number,
 * no dates, no status and no record of who checked them - so the console
 * could list a file and open it, and nothing else. Vendors have carried all
 * of that for a while. This gives riders the same shape, keyed the same way,
 * so one screen can serve both.
 *
 * key      - canonical name, used in URLs and in `documentRecords`
 * label    - how the document is named to a person
 * legacy   - the `kycDocuments.*` field to mirror to, where one exists
 * required - counts toward the partner's overall KYC state
 * expires  - carries an expiry date
 */
export const RIDER_DOCUMENT_TYPES = [
  { key: 'aadhaar', label: 'Aadhaar', legacy: 'aadhaar', required: true, expires: false },
  { key: 'pan', label: 'PAN Card', legacy: null, required: false, expires: false },
  {
    key: 'drivingLicense',
    label: 'Driving Licence',
    legacy: 'drivingLicense',
    required: true,
    expires: true,
  },
  { key: 'vehicleRC', label: 'Vehicle RC', legacy: 'vehicleRC', required: true, expires: true },
  { key: 'insurance', label: 'Vehicle Insurance', legacy: null, required: false, expires: true },
  { key: 'photo', label: 'Photo', legacy: 'selfie', required: false, expires: false },
  {
    key: 'passbook',
    label: 'Passbook / Cancelled Cheque',
    legacy: null,
    required: false,
    expires: false,
  },
];

const BY_KEY = new Map(RIDER_DOCUMENT_TYPES.map((entry) => [entry.key, entry]));

/** Names the app and older console builds have used for the same document. */
const ALIASES = {
  selfie: 'photo',
  profilePhoto: 'photo',
  dl: 'drivingLicense',
  license: 'drivingLicense',
  licence: 'drivingLicense',
  rc: 'vehicleRC',
  vehicleRc: 'vehicleRC',
  passbookCancelledCheque: 'passbook',
  cancelledCheque: 'passbook',
  bankPassbook: 'passbook',
};

export function resolveRiderDocumentType(value) {
  if (!value) return null;
  const key = ALIASES[value] ?? value;
  return BY_KEY.get(key) ?? null;
}

export const RIDER_DOCUMENT_KEYS = RIDER_DOCUMENT_TYPES.map((entry) => entry.key);

/**
 * The partner's overall KYC state, from the documents on file.
 *
 * Same rule as vendors: rejecting one required document rejects the partner,
 * approval needs every required document verified, and `rejected` is not
 * sticky - re-uploading clears it, so somebody can fix a problem without an
 * admin resetting a flag by hand.
 */
export function deriveRiderKycStatus(records) {
  const required = RIDER_DOCUMENT_TYPES.filter((entry) => entry.required);
  const statusFor = (key) => {
    const record = records?.get ? records.get(key) : records?.[key];
    return record?.url ? record.status || 'pending' : null;
  };

  const states = required.map((entry) => statusFor(entry.key));

  if (states.some((state) => state === 'rejected')) return 'rejected';
  if (states.length > 0 && states.every((state) => state === 'verified')) return 'approved';

  const anyFiled = RIDER_DOCUMENT_KEYS.some((key) => statusFor(key) !== null);
  return anyFiled ? 'under_review' : 'pending';
}
