import React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppBar } from "@/components/screen-header";
import {
  Button,
  Field,
  IconPlate,
  NoteBar,
  Panel,
  SelectField,
  Txt,
  colors,
} from "@/components/ui";
import { VerifiedField } from "@/components/verified-field";
import { request, API_BASE_URL, NGROK_HEADERS, currentToken } from "@/lib/api";
import {
  EMPTY_DRAFT,
  clearDraft,
  loadDraft,
  saveDraft,
  type RiderDraft,
} from "@/lib/registration";

/**
 * Rider onboarding, in the steps the brief sets out.
 *
 * Who they are is taken on the Sign Up screen, after Login has verified their
 * mobile number, and lands here as a draft; these are the rest — personal
 * details, where they are based, documents, bank — and the application is
 * submitted at the end.
 *
 * Every step writes the draft, so a rider who is interrupted comes back to
 * where they were rather than to an empty form. The account is created by the
 * submission rather than at sign-up, so an abandoned attempt leaves nothing
 * behind.
 */

const STEPS = ["Personal", "Address", "Documents", "Bank", "Review"];

/** What the API stores each document under. */
const DOCUMENTS = [
  { type: "aadhaar", label: "Aadhaar Card", required: true },
  { type: "pan", label: "PAN Card", required: true },
  { type: "drivingLicense", label: "Driving Licence", required: true },
  // Not everyone riding owns the vehicle, so the book is not theirs to produce.
  { type: "vehicleRC", label: "Vehicle RC", required: false },
  { type: "vehiclePhoto", label: "Vehicle photo", required: true },
  { type: "insurance", label: "Vehicle insurance", required: false },
  // Nowhere to send the money without it.
  { type: "passbookCancelledCheque", label: "Passbook or cancelled cheque", required: true },
  { type: "selfie", label: "Photo of you", required: false },
];

const ACCOUNT_TYPES = ["Savings Account", "Current Account"];
const VEHICLES = ["bike", "scooter", "car", "van", "cycle"];

function Choice({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string;
  onPick: (next: string) => void;
}) {
  return (
    <View className="mt-2 flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onPick(option)}
            className={`rounded-tile border px-3 py-2 active:opacity-70 ${
              active ? "border-brand-500 bg-brand-50" : "border-line bg-surface"
            }`}
          >
            <Txt size="tiny" weight={active ? "bold" : "regular"} tone={active ? "brand" : "default"}>
              {option}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Types the slashes in, so the rider only enters digits.
 *
 * Anything that is not a digit is dropped rather than rejected: a paste that
 * carries dashes or spaces still lands as a date instead of failing.
 */
/** A content type guessed from the file name, for pickers that report none. */
function mimeFromName(name?: string | null): string | null {
  const extension = String(name || "").split(".").pop()?.toLowerCase();
  if (!extension) return null;
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return null;
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * DD/MM/YYYY to the ISO date the server stores, or null if it is not a real
 * date. Checked by rebuilding it, so 31/02/2000 is refused rather than
 * silently rolling into March.
 */
function isoFromDDMMYYYY(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd)
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Who an emergency contact can be, as the client specified them.
 *
 * "Other" is deliberately last and deliberately present: somebody's contact
 * is their neighbour or their landlord, and a list with no way out means they
 * pick the nearest wrong answer.
 */
const EMERGENCY_RELATIONSHIPS = [
  "Father",
  "Mother",
  "Wife",
  "Brother",
  "Friend",
  "Relative",
  "Other",
] as const;

export default function RiderRegister() {
  const router = useRouter();
  const [draft, setDraft] = React.useState<RiderDraft | null>(null);

  /*
   * Proof from the server that the email address was confirmed. Registration
   * will not accept it without one, so a tick drawn in the app on its own gets
   * nowhere. The mobile number's proof is already in the draft: it was issued
   * when the code that brought the rider here came back.
   */
  const [emailProof, setEmailProof] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // Reopen where they left off.
  React.useEffect(() => {
    void (async () => {
      const saved = await loadDraft();
      if (!saved || !saved.phoneProof) {
        // No verified number: that happens at Login.
        router.replace("/(auth)/login");
        return;
      }
      if (!saved.email) {
        // The number is verified but the sign-up page has not been done.
        router.replace("/(auth)/signup");
        return;
      }
      setDraft(saved);
      setStep(Math.min(saved.step, STEPS.length - 1));
    })();
  }, [router]);

  const set = React.useCallback(
    (key: keyof RiderDraft, value: any) =>
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, [key]: value };
        void saveDraft(next);
        return next;
      }),
    []
  );

  const goto = (next: number) => {
    setError(null);
    setStep(next);
    if (draft) void saveDraft({ ...draft, step: next });
  };

  if (!draft) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-sunken">
        <ActivityIndicator color={colors.brand[500]} />
      </View>
    );
  }


  /**
   * Holds the documents the rider has chosen, until there is an account to
   * attach them to.
   *
   * Not in the saved draft: a File on the web and a cache uri on a phone
   * neither survive being written to storage and read back. Coming back to a
   * half-finished application means picking the files again, which is the
   * honest behaviour - the alternative is a filename shown against a file
   * that is no longer there.
   */
  const [pendingDocs, setPendingDocs] = React.useState<
    Record<string, DocumentPicker.DocumentPickerAsset>
  >({});

  /**
   * Chooses one document. Nothing is sent yet.
   *
   * This used to upload immediately, to an endpoint that attaches the file to
   * the rider's account - and the account is not created until the last step
   * of this form. So every upload answered "Rider not found", the filename
   * was never recorded, and the Continue button, which waits for the required
   * documents, could never be satisfied. The application could not be
   * submitted at all.
   *
   * The files now travel with the application: registered first, uploaded
   * straight after, which is the order the API was built for.
   */
  const chooseDocument = async (type: string, label: string) => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const file = picked.assets[0];
      if (!file.file && !file.uri) {
        throw new Error("That file could not be read. Please choose it again.");
      }

      setPendingDocs((current) => ({ ...current, [type]: file }));
      set("documents", { ...draft.documents, [type]: file.name ?? label });
    } catch (reason: any) {
      setError(reason?.message ?? `Could not read your ${label}.`);
    }
  };

  /**
   * Sends one held document to the new account.
   *
   * The two platforms want different things in a FormData part: on the web
   * the picker hands back a real File and no useful uri, and appending
   * {uri, name, type} there makes the browser serialise an object instead of
   * sending the file.
   */
  const sendDocument = async (
    type: string,
    file: DocumentPicker.DocumentPickerAsset
  ) => {
    const body = new FormData();
    if (file.file) {
      body.append("document", file.file, file.name ?? type);
    } else {
      body.append("document", {
        uri: file.uri,
        name: file.name || `${type}.jpg`,
        // An untyped part is refused by some servers; guessed from the
        // extension rather than sent as application/octet-stream.
        type: file.mimeType || mimeFromName(file.name) || "image/jpeg",
      } as any);
    }
    body.append("documentType", String(type));
    body.append("email", String(draft.email ?? ""));
    body.append("phone", String(draft.phone ?? ""));

    const token = currentToken();
    const response = await fetch(`${API_BASE_URL}/rider/register/upload-document`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...NGROK_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message ?? `Upload failed (${response.status})`);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await request("/rider/register", {
        method: "POST",
        anonymous: true,
        body: {
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          referralCode: draft.referralCode || undefined,
          emailProof,
          phoneProof: draft.phoneProof,

          // Stored as an ISO date whatever the rider typed.
          dateOfBirth: isoFromDDMMYYYY(draft.dateOfBirth) || undefined,
          gender: draft.gender || undefined,
          emergencyContactName: draft.emergencyContactName,
          emergencyContactPhone: draft.emergencyContactPhone,
          emergencyRelationship: draft.emergencyRelationship,

          fullAddress: draft.address,
          city: draft.city,
          landmark: draft.landmark || undefined,
          state: draft.state || undefined,
          pincode: draft.pincode || undefined,

          /*
           * The postal address, resolved here rather than on the server: the
           * checkbox is a question about this form, and whichever way it is
           * answered the rider has exactly one address to be written to.
           */
          communicationAddress: draft.communicationSameAsAddress
            ? draft.address
            : draft.communicationAddress,
          communicationCity: draft.communicationSameAsAddress
            ? draft.city
            : draft.communicationCity,
          communicationLandmark: draft.communicationSameAsAddress
            ? draft.landmark
            : draft.communicationLandmark,
          communicationState: draft.communicationSameAsAddress
            ? draft.state
            : draft.communicationState,
          communicationPincode: draft.communicationSameAsAddress
            ? draft.pincode
            : draft.communicationPincode,
          communicationSameAsAddress: draft.communicationSameAsAddress,

          vehicleType: draft.vehicleType,
          vehicleBrand: draft.vehicleBrand,
          vehicleModel: draft.vehicleModel,
          vehicleName: `${draft.vehicleBrand} ${draft.vehicleModel}`.trim(),
          vehicleNumber: draft.vehicleNumber,

          accountHolderName: draft.accountHolderName,
          bankName: draft.bankName,
          accountNumber: draft.accountNumber,
          ifscCode: draft.ifscCode,
          branchName: draft.accountType,
        },
      });
      /*
       * Now that the account exists, the documents can be attached, and the
       * application closed off. Registering alone left every rider with
       * `isProfileComplete` false and no papers on file.
       */
      const failed: string[] = [];
      for (const doc of DOCUMENTS) {
        const file = pendingDocs[doc.type];
        if (!file) continue;
        try {
          await sendDocument(doc.type, file);
        } catch {
          failed.push(doc.label);
        }
      }

      if (failed.length > 0) {
        throw new Error(
          `Your account was created, but ${failed.join(" and ")} did not upload. ` +
            "Sign in and add them from Documents."
        );
      }

      await request("/rider/register/finalize", {
        method: "POST",
        anonymous: true,
        body: { email: draft.email, phone: draft.phone },
      });

      await clearDraft();
      setDone(true);
    } catch (reason: any) {
      setError(reason?.message ?? "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
        <ScrollView contentContainerClassName="p-4">
          <Panel title="Application submitted">
            <View className="items-center py-3">
              <IconPlate icon="checkmark-circle" tint="green" size={56} />
              <Txt size="xl" weight="bold" className="mt-3 text-center">
                Thanks — we have your application
              </Txt>
              <Txt size="sm" tone="muted" className="mt-2 text-center">
                Our team will review it and let you know. You can sign in with your
                mobile number to check where it has got to.
              </Txt>
            </View>
          </Panel>
          <Button
            label="Go to sign in"
            accent="brand"
            size="lg"
            className="mt-4"
            onPress={() => router.replace("/(auth)/login")}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const requiredDocs = DOCUMENTS.filter((doc) => doc.required);
  const docsDone = requiredDocs.every((doc) => draft.documents[doc.type]);

  /** What is missing on the step being shown, or null. */
  const problem = (() => {
    if (step === 0) {
      /*
       * The email address has to be proved before the rider goes any further,
       * so a signup cannot be finished against one that belongs to somebody
       * else. The mobile number already was, by signing in with it.
       */
      if (!emailProof) return "Verify your email address to continue.";
      if (!draft.dateOfBirth.trim()) return "Enter your date of birth.";
      if (!isoFromDDMMYYYY(draft.dateOfBirth))
        return "Enter your date of birth as DD/MM/YYYY.";
      if (!draft.emergencyContactName.trim()) return "Enter an emergency contact name.";
      if (!/^[6-9]\d{9}$/.test(draft.emergencyContactPhone.replace(/\D/g, "").slice(-10)))
        return "Enter a valid emergency contact number.";
    }
    if (step === 1) {
      if (!draft.address.trim()) return "Enter your address.";
      if (!draft.city.trim()) return "Enter your city.";
      if (!draft.state.trim()) return "Enter your state.";
      if (draft.pincode.trim().length !== 6) return "Enter a six-digit pincode.";
      // Only checked when it is a second address; otherwise it is the one above.
      if (!draft.communicationSameAsAddress) {
        if (!draft.communicationAddress.trim())
          return "Enter your communication address, or tick the box above.";
        if (!draft.communicationCity.trim()) return "Enter the communication city.";
        if (!draft.communicationState.trim()) return "Enter the communication state.";
        if (draft.communicationPincode.trim().length !== 6)
          return "Enter a six-digit communication pincode.";
      }
    }
    if (step === 2) {
      if (!draft.vehicleNumber.trim()) return "Enter your vehicle number.";
      if (!draft.vehicleBrand.trim() || !draft.vehicleModel.trim())
        return "Enter your vehicle's make and model.";
      if (!docsDone) return "Upload the required documents.";
    }
    if (step === 3) {
      if (!draft.accountHolderName.trim()) return "Enter the account holder's name.";
      if (!draft.bankName.trim()) return "Enter your bank's name.";
      if (draft.accountNumber.length < 6) return "Enter your account number.";
      if (!draft.ifscCode.trim()) return "Enter the IFSC code.";
      if (!draft.accountType) return "Choose an account type.";
    }
    return null;
  })();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <AppBar title="Become a partner" leading="back" />

      {/* Where they are, and how much is left. */}
      <View className="flex-row gap-1.5 px-4 pb-2">
        {STEPS.map((label, index) => (
          <View key={label} className="flex-1">
            <View
              className={`h-1 rounded-full ${index <= step ? "bg-brand-500" : "bg-line"}`}
            />
            <Txt
              size="micro"
              tone={index === step ? "brand" : "faint"}
              weight={index === step ? "bold" : "regular"}
              className="mt-1"
            >
              {label}
            </Txt>
          </View>
        ))}
      </View>

      <ScrollView contentContainerClassName="p-4 pb-10">
        {error && (
          <View className="mb-3">
            <NoteBar tone="red" icon="alert-circle" detail={error} />
          </View>
        )}

        {step === 0 && (
          <Panel title="Personal details">
            <Field
              label="Full name"
              value={draft.name}
              onChangeText={(next) => set("name", next)}
              placeholder="As it appears on your ID"
            />
            {/*
              The number the rider signed in with: verified by the code that
              brought them here, and not editable - it is what the account is
              for, and what they will sign in with from now on.
            */}
            <View className="mt-3">
              <Txt size="tiny" tone="muted" className="mb-0.5">
                Mobile number
              </Txt>
              <View className="min-h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface-sunken px-3 py-3">
                <Txt weight="semibold" className="flex-1">
                  +91 {draft.phone}
                </Txt>
                <Ionicons name="checkmark-circle" size={16} color={colors.green[600]} />
                <Txt size="tiny" weight="semibold" className="text-green-600">
                  Verified
                </Txt>
              </View>
            </View>
            <VerifiedField
              channel="email"
              label="Email"
              value={draft.email}
              onChangeText={(next) => set("email", next)}
              placeholder="you@example.com"
              keyboardType="email-address"
              role="rider"
              counterpart={draft.phone}
              proof={emailProof}
              onVerified={setEmailProof}
            />
            {/*
              Written the way it is read in India. The field asked for
              YYYY-MM-DD, which nobody types, so riders entered 12/05/1998 and
              the server stored something it could not parse. The slashes are
              inserted as they type and it is sent as an ISO date.
            */}
            <Field
              label="Date of birth"
              value={draft.dateOfBirth}
              onChangeText={(next) => set("dateOfBirth", formatDateInput(next))}
              placeholder="DD/MM/YYYY"
              keyboardType="number-pad"
            />
            <Txt size="tiny" tone="muted" className="mb-1 mt-3">
              Gender
            </Txt>
            <Choice
              options={["Male", "Female", "Other"]}
              value={draft.gender}
              onPick={(next) => set("gender", next)}
            />
            <View className="mt-4">
              <Txt weight="bold">Emergency contact</Txt>
              <Field
                label="Name"
                value={draft.emergencyContactName}
                onChangeText={(next) => set("emergencyContactName", next)}
                placeholder="Who should we call"
              />
              <Field
                label="Their number"
                value={draft.emergencyContactPhone}
                onChangeText={(next) => set("emergencyContactPhone", next)}
                placeholder="9123456789"
                keyboardType="number-pad"
              />
              {/*
                Chosen from a list rather than typed. "Wife", "wife" and
                "spouse" are one relationship written three ways, and only one
                of them sorts or counts.
              */}
              <SelectField
                label="Relationship"
                placeholder="Select relationship"
                value={draft.emergencyRelationship}
                options={EMERGENCY_RELATIONSHIPS}
                onSelect={(next) => set("emergencyRelationship", next)}
                icon="people"
              />
            </View>
          </Panel>
        )}

        {step === 1 && (
          <>
            <Panel title="Where you live">
              {/*
                Typed out in parts rather than captured from GPS.
                
                The step used to ask for a street and a city and then read the
                phone's coordinates, which is not an address: nothing could be
                posted to it, and a rider signing up at a friend's house
                registered their friend's house. Orders are offered by where
                the rider is at the time, which the app reports while they are
                on duty - it was never this.
              */}
              <Field
                label="Address"
                value={draft.address}
                onChangeText={(next) => set("address", next)}
                placeholder="House, street, area"
              />
              <Field
                label="City"
                value={draft.city}
                onChangeText={(next) => set("city", next)}
                placeholder="Tirupati"
              />
              <Field
                label="Landmark"
                value={draft.landmark}
                onChangeText={(next) => set("landmark", next)}
                placeholder="Near the railway station"
              />
              <Field
                label="State"
                value={draft.state}
                onChangeText={(next) => set("state", next)}
                placeholder="Andhra Pradesh"
              />
              <Field
                label="Pincode"
                value={draft.pincode}
                onChangeText={(next) => set("pincode", next.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="517501"
                keyboardType="number-pad"
              />
            </Panel>

            <Panel title="Communication address" className="mt-4">
              <Pressable
                onPress={() =>
                  set("communicationSameAsAddress", !draft.communicationSameAsAddress)
                }
                className="flex-row items-center gap-2.5 py-1 active:opacity-70"
              >
                <View
                  style={{
                    borderColor: draft.communicationSameAsAddress
                      ? colors.bad.default
                      : colors.line.strong,
                    backgroundColor: draft.communicationSameAsAddress
                      ? colors.bad.default
                      : "transparent",
                  }}
                  className="h-5 w-5 items-center justify-center rounded border"
                >
                  {draft.communicationSameAsAddress && (
                    <Ionicons name="checkmark" size={14} color="#ffffff" />
                  )}
                </View>
                <Txt size="sm">Same as the address above</Txt>
              </Pressable>

              {!draft.communicationSameAsAddress && (
                <View className="mt-2">
                  <Field
                    label="Address"
                    value={draft.communicationAddress}
                    onChangeText={(next) => set("communicationAddress", next)}
                    placeholder="House, street, area"
                  />
                  <Field
                    label="City"
                    value={draft.communicationCity}
                    onChangeText={(next) => set("communicationCity", next)}
                    placeholder="Tirupati"
                  />
                  <Field
                    label="Landmark"
                    value={draft.communicationLandmark}
                    onChangeText={(next) => set("communicationLandmark", next)}
                    placeholder="Near the railway station"
                  />
                  <Field
                    label="State"
                    value={draft.communicationState}
                    onChangeText={(next) => set("communicationState", next)}
                    placeholder="Andhra Pradesh"
                  />
                  <Field
                    label="Pincode"
                    value={draft.communicationPincode}
                    onChangeText={(next) =>
                      set("communicationPincode", next.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                    placeholder="517501"
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </Panel>
          </>
        )}

        {step === 2 && (
          <>
            <Panel title="Your vehicle">
              <Txt size="tiny" tone="muted">
                Type
              </Txt>
              <Choice
                options={VEHICLES}
                value={draft.vehicleType}
                onPick={(next) => set("vehicleType", next)}
              />
              <Field
                label="Make"
                value={draft.vehicleBrand}
                onChangeText={(next) => set("vehicleBrand", next)}
                placeholder="Honda"
              />
              <Field
                label="Model"
                value={draft.vehicleModel}
                onChangeText={(next) => set("vehicleModel", next)}
                placeholder="Activa 6G"
              />
              <Field
                label="Number plate"
                value={draft.vehicleNumber}
                onChangeText={(next) => set("vehicleNumber", next.toUpperCase())}
                placeholder="AP 03 BX 4417"
              />
            </Panel>

            <View className="mt-3">
              <Panel title="Documents">
                {DOCUMENTS.map((doc) => {
                  const uploaded = draft.documents[doc.type];
                  return (
                    <View
                      key={doc.type}
                      className="flex-row items-center gap-3 border-b border-line py-3 last:border-0"
                    >
                      <IconPlate
                        icon={uploaded ? "checkmark-circle" : "document-outline"}
                        tint={uploaded ? "green" : "red"}
                        size={36}
                      />
                      <View className="min-w-0 flex-1">
                        <Txt size="sm" weight="bold">
                          {doc.label}
                          {doc.required ? " *" : ""}
                        </Txt>
                        <Txt size="micro" tone={uploaded ? "green" : "muted"} numberOfLines={1}>
                          {uploaded ?? "JPG, PNG or PDF"}
                        </Txt>
                      </View>
                      {/* "Choose", not "Upload": the file goes up with the
                          application, once there is an account to attach it to. */}
                      <Button
                        label={uploaded ? "Replace" : "Choose"}
                        variant="outline"
                        accent="brand"
                        size="sm"
                        onPress={() => void chooseDocument(doc.type, doc.label)}
                      />
                    </View>
                  );
                })}
              </Panel>
            </View>
          </>
        )}

        {step === 3 && (
          <Panel title="Where we pay you">
            <Field
              label="Account holder name"
              value={draft.accountHolderName}
              onChangeText={(next) => set("accountHolderName", next)}
              placeholder="As it appears at the bank"
            />
            <Field
              label="Bank name"
              value={draft.bankName}
              onChangeText={(next) => set("bankName", next)}
              placeholder="State Bank of India"
            />
            <Field
              label="Account number"
              value={draft.accountNumber}
              onChangeText={(next) => set("accountNumber", next.replace(/\D/g, ""))}
              placeholder="Account number"
              keyboardType="number-pad"
            />
            <Field
              label="IFSC code"
              value={draft.ifscCode}
              onChangeText={(next) => set("ifscCode", next.toUpperCase().replace(/\s/g, ""))}
              placeholder="SBIN0001234"
            />
            <Txt size="tiny" tone="muted" className="mb-1 mt-3">
              Account type
            </Txt>
            <Choice
              options={ACCOUNT_TYPES}
              value={draft.accountType}
              onPick={(next) => set("accountType", next)}
            />
          </Panel>
        )}

        {step === 4 && (
          <>
            <NoteBar
              tone="amber"
              icon="clipboard"
              title="Almost there"
              detail="Check your details, then send the application for review."
            />
            <View className="mt-3">
              <Panel title="Review">
                {[
                  ["Name", draft.name],
                  ["Mobile", draft.phone],
                  ["Email", draft.email],
                  ["Date of birth", draft.dateOfBirth],
                  ["Emergency contact", `${draft.emergencyContactName} · ${draft.emergencyContactPhone}`],
                  ["Address", `${draft.address}, ${draft.city}`],
                  ["Location", draft.latitude ? "Captured" : "Not captured"],
                  ["Vehicle", `${draft.vehicleBrand} ${draft.vehicleModel} · ${draft.vehicleNumber}`],
                  ["Documents", `${Object.keys(draft.documents).length} uploaded`],
                  ["Bank", `${draft.bankName} · ${draft.accountNumber.slice(-4).padStart(8, "•")}`],
                ].map(([label, value]) => (
                  <View key={label} className="flex-row justify-between border-b border-line py-2.5 last:border-0">
                    <Txt size="tiny" tone="muted">
                      {label}
                    </Txt>
                    <Txt size="tiny" weight="semibold" className="ml-3 flex-1 text-right">
                      {value || "—"}
                    </Txt>
                  </View>
                ))}
              </Panel>
            </View>
          </>
        )}

        {problem && (
          <Txt size="tiny" tone="muted" className="mt-3">
            {problem}
          </Txt>
        )}

        <View className="mt-5 flex-row gap-3">
          {step > 0 && (
            <Button
              label="Back"
              variant="outline"
              accent="brand"
              className="flex-1"
              onPress={() => goto(step - 1)}
            />
          )}
          <Button
            label={
              busy ? "Submitting…" : step === STEPS.length - 1 ? "Submit application" : "Continue"
            }
            accent="brand"
            className="flex-[1.6]"
            disabled={Boolean(problem) || busy}
            onPress={() => (step === STEPS.length - 1 ? void submit() : goto(step + 1))}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
