import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The rider's application, held between steps.
 *
 * Registration is seven screens long and a rider is filling it in on a phone,
 * standing somewhere, probably interrupted. Losing it because the app was
 * backgrounded is the difference between an application and an abandoned one,
 * so every step writes the draft and the wizard reads it back on open.
 *
 * The account is created at the end rather than the beginning: the brief has
 * it as Submit Application → Admin Verification → Rider Login, and creating it
 * at step one leaves a half-registered rider behind every abandoned attempt.
 */

const KEY = "reditoe.rider.application";

export interface RiderDraft {
  /* Step 1 — credentials */
  name: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;

  /* Step 2 — personal */
  dateOfBirth: string;
  gender: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyRelationship: string;

  /* Step 3 — where they live */
  address: string;
  city: string;
  landmark: string;
  state: string;
  pincode: string;
  /**
   * Where post should go, when it is not where they live.
   *
   * Most riders have one address, so the checkbox is on by default and the
   * second set of fields stays out of the way until it is turned off.
   */
  communicationSameAsAddress: boolean;
  communicationAddress: string;
  communicationCity: string;
  communicationLandmark: string;
  communicationState: string;
  communicationPincode: string;
  latitude: string;
  longitude: string;

  /* Step 4 — vehicle and documents */
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleNumber: string;
  /** documentType -> the file name that was uploaded. */
  documents: Record<string, string>;

  /* Step 5 — bank */
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;

  /** Which step to reopen on. */
  step: number;
}

export const EMPTY_DRAFT: RiderDraft = {
  name: "",
  email: "",
  phone: "",
  password: "",
  dateOfBirth: "",
  gender: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyRelationship: "",
  address: "",
  city: "",
  landmark: "",
  state: "",
  pincode: "",
  communicationSameAsAddress: true,
  communicationAddress: "",
  communicationCity: "",
  communicationLandmark: "",
  communicationState: "",
  communicationPincode: "",
  latitude: "",
  longitude: "",
  vehicleType: "bike",
  vehicleBrand: "",
  vehicleModel: "",
  vehicleNumber: "",
  documents: {},
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "",
  step: 0,
};

export async function loadDraft(): Promise<RiderDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    // Merged over the empty draft so a draft written by an older build, before
    // a field existed, still opens instead of arriving with holes in it.
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<RiderDraft>) };
  } catch {
    return null;
  }
}

export async function saveDraft(draft: RiderDraft) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A failed write costs the rider their progress on a crash, which is bad
    // but not worth blocking the step they are on for.
  }
}

/** Called once the application is in — the draft has done its job. */
export async function clearDraft() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
