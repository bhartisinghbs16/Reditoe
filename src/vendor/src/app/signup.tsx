import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageBar } from "@/components/screen-header";
import {
  CheckRow,
  FieldLabel,
  KeyValue,
  NoteCard,
  SelectField,
  TagToggle,
  TextField,
  WizardSteps,
} from "@/components/form";
import { Badge, Button, Card, IconPlate, Txt, colors } from "@/components/ui";
import { friendlyDateTime } from "@/lib/format";
import { registerVendor, uploadKycDocument } from "@/lib/api";
import { useStore } from "@/lib/store";
import { VerifiedField } from "@/components/verified-field";
import { tints, type TintName } from "@/lib/theme";

/**
 * Vendor Sign Up — a copy of the reference five-step onboarding flow:
 * Restaurant Info → Documents → Bank Details → Review → Complete.
 *
 * Reached from Login once the vendor's mobile number has been verified and
 * turned out not to belong to anybody; the number is carried in rather than
 * asked for again. Step 4 posts to `/vendor/register`, which returns a token —
 * so a successful registration also signs the vendor in. Documents and bank details are
 * collected on the way through but the register endpoint accepts neither;
 * they belong to the KYC and bank endpoints once the account exists.
 */

const STEPS = ["Restaurant Info", "Documents", "Bank Details", "Review", "Complete"];
const STEP_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  "storefront-outline",
  "document-text-outline",
  "business-outline",
  "eye-outline",
  "checkmark-circle-outline",
];

const CUISINES = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Fast Food",
  "Biryani",
  "Cafe",
  "Bakery",
  "Desserts",
  "Other",
];

const DOCUMENTS: {
  /** What the API stores it under — see the vendor KYC controller. */
  type: string;
  label: string;
  detail: string;
  formats: string;
  tint: TintName;
  icon: keyof typeof Ionicons.glyphMap;
  required?: boolean;
  action?: string;
  /** Uploading again adds another rather than replacing what is there. */
  multiple?: boolean;
}[] = [
  {
    type: "fssai",
    label: "FSSAI License",
    detail: "Upload valid FSSAI license",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "ribbon-outline",
    required: true,
  },
  {
    type: "pan",
    label: "PAN Card",
    detail: "Upload PAN card of your business",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "card-outline",
    required: true,
  },
  {
    type: "gst",
    label: "GST Certificate",
    detail: "Upload GST registration certificate",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "receipt-outline",
    required: true,
  },
  {
    type: "shop",
    label: "Shop & Establishment License",
    detail: "Upload shop & establishment license",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "business-outline",
  },
  {
    // Named outright rather than hidden inside "Owner Identity Proof": the KYC
    // section is required to list Aadhaar, and the API has always stored it
    // under its own name.
    type: "aadhaar",
    label: "Aadhaar Card",
    detail: "Upload the owner's Aadhaar card",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "person-outline",
    required: true,
  },
  {
    type: "cancelledCheque",
    label: "Cancelled Cheque",
    detail: "Upload a cancelled cheque for your account",
    formats: "JPG, PNG or PDF – Max 5MB",
    tint: "red",
    icon: "document-text-outline",
  },
  {
    /*
     * Photos of the place, and as many as the vendor wants.
     *
     * This took one photo and filed it with the licences, so there was no
     * gallery to build and nothing for a customer or an admin to look at.
     * Uploading again adds another rather than replacing the first.
     */
    type: "restaurantPhoto",
    label: "Restaurant Images",
    detail: "Front view, seating, kitchen — add as many as you like",
    formats: "JPG or PNG – Max 5MB each",
    tint: "red",
    icon: "camera-outline",
    required: true,
    action: "Add Photo",
    multiple: true,
  },
  {
    type: "menu",
    label: "Menu Upload (Optional)",
    detail: "Upload your menu in Excel or PDF",
    formats: "XLSX, PDF – Max 10MB",
    tint: "red",
    icon: "book-outline",
  },
];

/* ── Step 1 — Restaurant info ───────────────────────────────────────────── */

interface Form {
  restaurantName: string;
  street: string;
  city: string;
  zipCode: string;
  phone: string;
  email: string;
  contactPersonName: string;
  /**
   * Bank details. These were on the screen but bound to nothing — no value, no
   * change handler — so everything typed was discarded on the way to Review and
   * the vendor's account details never reached us at all.
   */
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  accountType: string;
  /**
   * Where the restaurant actually is.
   *
   * Dispatch measures a rider's distance from these, so without them a
   * restaurant is unreachable by the radius rules — it was never captured at
   * registration, and typing an address does not produce a position.
   */
  latitude: string;
  longitude: string;
  referralCode: string;
}

/**
 * The banks the account can be with, and the two kinds of account.
 *
 * Both were `SelectField`s with nothing behind them — the component takes an
 * `onPress` and none was passed, so tapping them did nothing. A fixed list is
 * right here: it is the field a vendor is most likely to mistype, and the API
 * stores it as free text either way.
 */
const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
  "IDFC FIRST Bank",
  "Yes Bank",
  "Federal Bank",
  "Other",
];

const ACCOUNT_TYPES = ["Savings Account", "Current Account"];

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

function RestaurantStep({
  cuisines,
  toggleCuisine,
  form,
  setField,
  emailProof,
  setEmailProof,
  accountEmail,
}: {
  cuisines: string[];
  toggleCuisine: (name: string) => void;
  form: Form;
  setField: (key: keyof Form, value: string) => void;
  /** Proof from the server that the email address was confirmed. */
  emailProof: string | null;
  setEmailProof: (proof: string | null) => void;
  /**
   * The email already on the account, when this is a vendor finishing a
   * registration that stopped half way. It is theirs and was verified when the
   * account was made - a code is never sent to an address an account already
   * holds - so it is shown, not asked for.
   */
  accountEmail?: string | null;
}) {
  const [locating, setLocating] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const located = Boolean(form.latitude && form.longitude);

  /**
   * Takes the device's current position.
   *
   * Orders are offered to riders by distance from the restaurant, so a
   * restaurant with no coordinates cannot be dispatched from — a typed address
   * is not a position, and nothing was geocoding it.
   */
  const capture = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(
          "Location permission was refused. Allow it in Settings so riders can be matched to your restaurant."
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setField("latitude", String(position.coords.latitude));
      setField("longitude", String(position.coords.longitude));
    } catch {
      setLocationError("Could not read your location. Try again with GPS switched on.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View className="gap-3">
      <Card className="p-4">
        <View className="flex-row items-center gap-2.5">
          <IconPlate
            icon={located ? "checkmark-circle" : "location-outline"}
            tint={located ? "green" : "red"}
            size={38}
          />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Restaurant location</Txt>
            <Txt size="tiny" tone="muted">
              {located
                ? `Captured: ${Number(form.latitude).toFixed(5)}, ${Number(form.longitude).toFixed(5)}`
                : "Stand at your restaurant and capture its position."}
            </Txt>
          </View>
        </View>

        <Txt size="micro" tone="faint" className="mt-2">
          Orders are offered to riders near your restaurant, so this decides
          which of them see yours.
        </Txt>

        {locationError && (
          <Txt size="micro" tone="bad" className="mt-2">
            {locationError}
          </Txt>
        )}

        <Button
          label={locating ? "Getting location…" : located ? "Capture again" : "Use my current location"}
          icon="navigate-outline"
          variant={located ? "outline" : "solid"}
          size="sm"
          className="mt-3"
          disabled={locating}
          onPress={() => void capture()}
        />
      </Card>
      <Card className="flex-row items-center gap-3 p-4">
        <IconPlate icon="storefront" tint="red" size={52} />
        <View className="min-w-0 flex-1">
          <Txt weight="bold">Join Reditoe and grow your business</Txt>
          {[
            "Get more orders and increase sales",
            "Fast payouts and 24/7 support",
            "Easy to manage menu & orders",
          ].map((line) => (
            <View key={line} className="mt-1 flex-row items-center gap-1.5">
              <Ionicons name="checkmark-circle" size={14} color={colors.ok.default} />
              <Txt size="tiny" tone="soft" className="flex-1">
                {line}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      <Card className="p-4">
        <Txt size="lg" weight="bold">
          Restaurant Information
        </Txt>
        <Txt size="tiny" tone="muted" className="mb-3 mt-0.5">
          Please provide basic details about your restaurant
        </Txt>

        <TextField
          label="Restaurant Name"
          required
          placeholder="Enter restaurant name"
          icon="storefront-outline"
          maxLength={50}
          value={form.restaurantName}
          onChangeText={(next) => setField("restaurantName", next)}
        />
        <TextField
          label="Owner / Contact Person"
          placeholder="Who should we contact?"
          icon="person-outline"
          value={form.contactPersonName}
          onChangeText={(next) => setField("contactPersonName", next)}
          className="mt-3"
        />

        <View className="mt-3">
          <FieldLabel label="Cuisine Type" required hint="(Select one or more)" />
          <View className="flex-row flex-wrap gap-2">
            {CUISINES.map((cuisine) => (
              <TagToggle
                key={cuisine}
                label={cuisine}
                icon="restaurant-outline"
                tint="red"
                selected={cuisines.includes(cuisine)}
                onPress={() => toggleCuisine(cuisine)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Referral Code (Optional)"
          placeholder="Enter referral code"
          icon="gift-outline"
          value={form.referralCode}
          onChangeText={(next) => setField("referralCode", next.toUpperCase())}
          className="mt-3"
        />

        <TextField
          label="Restaurant Address"
          required
          placeholder="Street and area"
          icon="location-outline"
          multiline
          value={form.street}
          onChangeText={(next) => setField("street", next)}
          className="mt-3"
        />

        <View className="mt-3 flex-row gap-2.5">
          <TextField
            label="City"
            required
            placeholder="Enter city"
            icon="business-outline"
            value={form.city}
            onChangeText={(next) => setField("city", next)}
            className="flex-1"
          />
          <TextField
            label="Pincode"
            placeholder="Enter pincode"
            icon="location-outline"
            keyboardType="numeric"
            value={form.zipCode}
            onChangeText={(next) => setField("zipCode", next)}
            className="flex-1"
          />
        </View>

        {/*
          The number the vendor signed in with: verified by the code that
          brought them here, and not editable - it is what the account is for,
          and what they will sign in with from now on.
        */}
        <View className="mt-3">
          <FieldLabel label="Mobile Number" required />
          <View className="h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface-sunken px-3">
            <Ionicons name="call-outline" size={17} color={colors.ink.faint} />
            <Txt weight="semibold" className="flex-1">
              +91 {form.phone}
            </Txt>
            <Ionicons name="checkmark-circle" size={16} color={colors.ok.default} />
            <Txt size="tiny" weight="semibold" tone="ok">
              Verified
            </Txt>
          </View>
        </View>
        {accountEmail ? (
          <View className="mt-3">
            <FieldLabel label="Email ID" required />
            <View className="h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface-sunken px-3">
              <Ionicons name="mail-outline" size={17} color={colors.ink.faint} />
              <Txt weight="semibold" className="flex-1" numberOfLines={1}>
                {accountEmail}
              </Txt>
              <Ionicons name="checkmark-circle" size={16} color={colors.ok.default} />
              <Txt size="tiny" weight="semibold" tone="ok">
                On your account
              </Txt>
            </View>
          </View>
        ) : (
          <VerifiedField
            channel="email"
            label="Email ID"
            placeholder="Enter email ID"
            icon="mail-outline"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(next) => setField("email", next)}
            proof={emailProof}
            onVerified={setEmailProof}
            className="mt-3"
          />
        )}
        <Txt size="micro" tone="muted" className="mt-1.5">
          {accountEmail
            ? "This email is already on your account, so there is nothing to verify."
            : "The email is verified by a code before the application can be submitted — it and your mobile number are how Reditoe and your customers reach the restaurant."}
        </Txt>
      </Card>
    </View>
  );
}

/* ── Step 2 — Documents ─────────────────────────────────────────────────── */

function DocumentsStep({
  uploaded,
  onUploaded,
}: {
  uploaded: Record<string, string>;
  onUploaded: (type: string, name: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Picks a file and sends it.
   *
   * The buttons had no handler at all, so the whole step was decorative — a
   * vendor could tap Upload on every row and submit an application with no
   * documents attached, which is the reported fault.
   */
  const pick = async (doc: (typeof DOCUMENTS)[number]) => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const file = picked.assets[0];
      setBusy(doc.type);

      const body = new FormData();

      /*
       * The two platforms want different things in a FormData part, and this
       * only ever built the native one.
       *
       * On the web the picker hands back a real File, and appending
       * {uri, name, type} instead makes the browser serialise an object -
       * which is what "Not supported format data part implementation" is
       * complaining about. The server then receives no file at all. The
       * comment here used to claim both were passed through as-is; they were
       * not.
       */
      if (file.file) {
        body.append("document", file.file, file.name ?? `${doc.type}`);
      } else {
        body.append("document", {
          uri: file.uri,
          name: file.name ?? `${doc.type}.jpg`,
          // A picker that reports no type leaves the part untyped, which some
          // servers reject outright; guessed from the extension instead.
          type: file.mimeType ?? mimeFromName(file.name) ?? "image/jpeg",
        } as any);
      }

      body.append("documentType", doc.type);

      await uploadKycDocument(body);
      /*
       * A section that takes several photos counts them, rather than showing
       * only the name of the last one uploaded.
       */
      onUploaded(
        doc.type,
        doc.multiple
          ? (() => {
              const already = Number(/^(\d+)/.exec(uploaded[doc.type] ?? "")?.[1] ?? 0);
              const total = already + 1;
              return `${total} image${total === 1 ? "" : "s"} uploaded`;
            })()
          : file.name ?? doc.label
      );
    } catch (reason: any) {
      setError(reason?.message ?? `Could not upload the ${doc.label}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3">
      <NoteCard
        icon="shield-checkmark"
        tint="red"
        title="Secure & Verified"
        detail="Your documents are safe with us and will only be used for verification."
      />

      {error && (
        <NoteCard icon="alert-circle" tint="red" title="Upload failed" detail={error} />
      )}

      <Card className="overflow-hidden">
        <View className="px-4 pb-3 pt-4">
          <Txt size="lg" weight="bold">
            Upload Documents
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            Please upload clear and valid documents
          </Txt>
        </View>

        {DOCUMENTS.map((doc) => {
          const done = uploaded[doc.type];
          return (
            <View
              key={doc.label}
              className="flex-row items-center gap-3 border-t border-line px-3.5 py-3"
            >
              <IconPlate
                icon={done ? "checkmark-circle" : doc.icon}
                tint={done ? "green" : doc.tint}
                size={40}
              />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-0.5">
                  <Txt size="sm" weight="bold" numberOfLines={2} className="shrink">
                    {doc.label}
                  </Txt>
                  {doc.required && (
                    <Txt size="sm" weight="bold" tone="brand">
                      *
                    </Txt>
                  )}
                </View>
                {/* Once it is on file, say which file — a tick alone leaves the
                    vendor guessing whether the right thing went up. */}
                <Txt size="micro" tone={done ? "ok" : "muted"} numberOfLines={2}>
                  {done ?? doc.detail}
                </Txt>
                {!done && (
                  <Txt size="micro" tone="faint" numberOfLines={1}>
                    ({doc.formats})
                  </Txt>
                )}
              </View>
              <Button
                label={busy === doc.type ? "Uploading…" : done ? "Replace" : doc.action ?? "Upload"}
                icon={done ? "refresh-outline" : "cloud-upload-outline"}
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onPress={() => void pick(doc)}
              />
            </View>
          );
        })}
      </Card>

      <NoteCard
        icon="information-circle"
        tint="red"
        detail="Note: All documents are mandatory except Menu. Please ensure documents are clear and not expired."
      />
    </View>
  );
}

/**
 * The list a SelectField opens.
 *
 * A modal rather than a dropdown: on a phone this is a full-width sheet, and it
 * keeps the choice visible while scrolling a long list of banks.
 */
function ChoiceSheet({
  title,
  options,
  visible,
  selected,
  onPick,
  onClose,
}: {
  title: string;
  options: string[];
  visible: boolean;
  selected?: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <View className="max-h-[70%] rounded-t-3xl bg-surface pb-6 pt-4">
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
            <Txt weight="bold" className="px-5 pb-2">
              {title}
            </Txt>
            <ScrollView>
              {options.map((option) => {
                const active = option === selected;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onPick(option);
                      onClose();
                    }}
                    className="flex-row items-center justify-between border-t border-line px-5 py-3.5 active:opacity-70"
                  >
                    <Txt size="sm" weight={active ? "bold" : "regular"}>
                      {option}
                    </Txt>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={colors.brand[600]} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Step 3 — Bank details ──────────────────────────────────────────────── */

function BankStep({
  form,
  setField,
}: {
  form: Form;
  setField: (key: keyof Form, value: string) => void;
}) {
  const [picking, setPicking] = React.useState<"bank" | "type" | null>(null);

  // Typing an account number twice is only worth asking for if the two are
  // compared, which they were not.
  const mismatch =
    form.confirmAccountNumber.length > 0 &&
    form.accountNumber !== form.confirmAccountNumber;

  return (
    <View className="gap-3">
      <NoteCard
        icon="shield-checkmark"
        tint="green"
        title="Safe & Secure Payments"
        detail="Add your bank details to receive payments directly in your account. We use 256-bit SSL encryption to protect your information."
      />

      <Card className="p-4">
        <Txt size="lg" weight="bold">
          Bank Account Details
        </Txt>
        <Txt size="tiny" tone="muted" className="mb-3 mt-0.5">
          Please provide your business bank account details
        </Txt>

        <TextField
          label="Account Holder Name"
          required
          placeholder="Enter account holder name as per bank"
          icon="person-outline"
          maxLength={50}
          value={form.accountHolderName}
          onChangeText={(next) => setField("accountHolderName", next)}
        />

        <SelectField
          label="Bank Name"
          required
          placeholder="Select your bank"
          icon="business-outline"
          className="mt-3"
          value={form.bankName || undefined}
          onPress={() => setPicking("bank")}
        />

        <TextField
          label="Account Number"
          required
          placeholder="Enter account number"
          icon="card-outline"
          keyboardType="numeric"
          maxLength={18}
          className="mt-3"
          value={form.accountNumber}
          onChangeText={(next) => setField("accountNumber", next.replace(/[^0-9]/g, ""))}
        />

        <TextField
          label="Confirm Account Number"
          required
          placeholder="Re-enter account number"
          icon="card-outline"
          keyboardType="numeric"
          maxLength={18}
          className="mt-3"
          value={form.confirmAccountNumber}
          onChangeText={(next) =>
            setField("confirmAccountNumber", next.replace(/[^0-9]/g, ""))
          }
        />
        {mismatch && (
          <Txt size="micro" tone="bad" className="mt-1">
            The two account numbers do not match.
          </Txt>
        )}

        <View className="mt-3">
          <FieldLabel label="IFSC Code" required />
          <TextField
            placeholder="Enter IFSC code"
            icon="key-outline"
            maxLength={11}
            value={form.ifsc}
            onChangeText={(next) => setField("ifsc", next.toUpperCase().replace(/\s/g, ""))}
          />
        </View>

        <SelectField
          label="Account Type"
          required
          placeholder="Select account type"
          icon="wallet-outline"
          className="mt-3"
          value={form.accountType || undefined}
          onPress={() => setPicking("type")}
        />
      </Card>

      <ChoiceSheet
        title="Select your bank"
        options={BANKS}
        visible={picking === "bank"}
        selected={form.bankName}
        onPick={(value) => setField("bankName", value)}
        onClose={() => setPicking(null)}
      />
      <ChoiceSheet
        title="Account type"
        options={ACCOUNT_TYPES}
        visible={picking === "type"}
        selected={form.accountType}
        onPick={(value) => setField("accountType", value)}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

/* ── Step 4 — Review ────────────────────────────────────────────────────── */

function ReviewSection({
  title,
  icon,
  tint,
  onEdit,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  /** Jumps back to the step this section summarises. */
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2.5">
        <IconPlate icon={icon} tint={tint} size={34} />
        <Txt weight="bold" className="flex-1">
          {title}
        </Txt>
        {/* Was a label and a pencil in a plain View — nothing to press, so
            review was a dead end for anyone who spotted a mistake. */}
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Ionicons name="pencil-outline" size={13} color={colors.brand[600]} />
          <Txt size="tiny" weight="semibold" tone="brand">
            Edit
          </Txt>
        </Pressable>
      </View>
      <View className="mt-3">{children}</View>
    </Card>
  );
}

function ReviewStep({
  confirmed,
  setConfirmed,
  cuisines,
  form,
  onEditStep,
}: {
  confirmed: boolean;
  setConfirmed: (next: boolean) => void;
  cuisines: string[];
  form: Form;
  onEditStep: (step: number) => void;
}) {
  return (
    <View className="gap-3">
      <NoteCard
        icon="clipboard"
        tint="blue"
        title="Almost There!"
        detail="Please review your details before submitting."
      />

      <ReviewSection
        title="Restaurant Information"
        icon="storefront-outline"
        tint="red"
        onEdit={() => onEditStep(0)}
      >
        <KeyValue label="Restaurant Name" value={form.restaurantName || "—"} />
        <KeyValue label="Contact Person" value={form.contactPersonName || "—"} />
        <KeyValue label="Cuisine Type" value={cuisines.join(", ") || "—"} />
        <KeyValue label="Address" value={form.street || "—"} />
        <KeyValue label="City" value={form.city || "—"} />
        <KeyValue label="Pincode" value={form.zipCode || "—"} />
        <KeyValue label="Contact Number" value={form.phone || "—"} />
        <KeyValue label="Email ID" value={form.email || "—"} />
      </ReviewSection>

      <ReviewSection
        title="Documents"
        icon="document-text-outline"
        tint="green"
        onEdit={() => onEditStep(1)}
      >
        {DOCUMENTS.map((doc) => (
          <View key={doc.label} className="flex-row items-center gap-2 py-1.5">
            <Ionicons name="checkmark-circle" size={15} color={colors.ok.default} />
            <Txt size="sm" tone="soft" className="flex-1" numberOfLines={1}>
              {doc.label.replace(" (Optional)", "")}
            </Txt>
            <Txt size="tiny" weight="semibold" tone="ok">
              View
            </Txt>
          </View>
        ))}
      </ReviewSection>

      {/* Documents and bank details are collected on steps 2 and 3, but
          `/vendor/register` accepts neither — they go through the KYC and
          bank endpoints once the account exists. Saying so beats listing
          values that were never sent. */}
      <ReviewSection
        title="Bank Details"
        icon="business-outline"
        tint="violet"
        onEdit={() => onEditStep(2)}
      >
        <Txt size="tiny" tone="muted">
          Bank details and documents are added from Settings after your account is
          created — registration only needs the restaurant itself.
        </Txt>
      </ReviewSection>

      <NoteCard
        icon="shield-checkmark"
        tint="amber"
        title="Secure & Verified"
        detail="Your information is 100% safe and secure with Reditoe. We will verify your details within 24-48 hours."
      />

      <Card className="px-3.5 py-1">
        <CheckRow
          label="I confirm that all the information provided is correct and true."
          checked={confirmed}
          onToggle={() => setConfirmed(!confirmed)}
        />
      </Card>
    </View>
  );
}

/* ── Step 5 — Complete ──────────────────────────────────────────────────── */

function CompleteStep({
  form,
  result,
}: {
  form: Form;
  result: { applicationId: string; message: string } | null;
}) {
  const details = [
    { icon: "storefront-outline" as const, label: "Restaurant Name", value: form.restaurantName || "—" },
    {
      icon: "clipboard-outline" as const,
      // Named the way the client's list names it, and the same value the
      // admin console shows as the outlet's reference.
      label: "Application Number",
      // Printed as the server issued it. Slicing the id here produced a
      // third reference for the same restaurant, agreeing with nothing.
      value: result?.applicationId || "—",
    },
    { icon: "time-outline" as const, label: "Submitted On", value: friendlyDateTime(new Date()) },
    { icon: "mail-outline" as const, label: "Registered Email", value: form.email || "—" },
    { icon: "call-outline" as const, label: "Contact Number", value: form.phone || "—" },
  ];

  return (
    <View className="gap-3">
      <View
        style={{ backgroundColor: tints.green.bg }}
        className="items-center rounded-card p-5"
      >
        <View className="h-16 w-16 items-center justify-center rounded-full bg-ok">
          <Ionicons name="checkmark" size={34} color="#ffffff" />
        </View>
        <Txt size="2xl" weight="bold" className="mt-3">
          Registration Submitted!
        </Txt>
        <Txt weight="semibold" tone="ok" className="mt-0.5">
          Thank you for joining Reditoe.
        </Txt>
        <Txt size="tiny" tone="soft" className="mt-1.5 text-center">
          Your application has been successfully submitted and is now under review.
        </Txt>

        <Card className="mt-4 w-full flex-row gap-3 p-3.5">
          <IconPlate icon="document-text-outline" tint="green" size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">What happens next?</Txt>
            {[
              "Our team will verify your details & documents",
              "You will be notified within 24-48 hours",
              "Once verified, you can start receiving orders",
            ].map((line) => (
              <View key={line} className="mt-1.5 flex-row items-start gap-2">
                <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-ok" />
                <Txt size="tiny" tone="soft" className="flex-1">
                  {line}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <Card className="overflow-hidden">
        <Txt size="lg" weight="bold" className="px-3.5 pb-2.5 pt-3.5">
          Your Application Details
        </Txt>
        {details.map((row, index) => (
          <View
            key={row.label}
            className={`flex-row items-center gap-3 border-t border-line px-3.5 py-2.5 ${
              index === details.length - 1 ? "" : ""
            }`}
          >
            <IconPlate icon={row.icon} tint="green" size={30} />
            <Txt size="tiny" tone="muted" className="flex-1" numberOfLines={1}>
              {row.label}
            </Txt>
            <Txt size="tiny" weight="semibold" className="flex-[1.2] text-right" numberOfLines={2}>
              {row.value}
            </Txt>
          </View>
        ))}
      </Card>

      <NoteCard
        icon="information-circle"
        tint="blue"
        title="Important Information"
        bullets={[
          "You will receive an email and SMS once your account is verified.",
          "You can log in to the vendor app after verification.",
          "For any help, contact our support team.",
        ]}
      />

      <View className="flex-row items-center justify-center gap-1.5 pb-1">
        <Ionicons name="shield-checkmark" size={13} color={tints.green.fg} />
        <Txt size="micro" tone="muted">
          Your information is 100% safe and secure with{" "}
          <Txt size="micro" weight="bold" tone="brand">
            Reditoe
          </Txt>
        </Txt>
      </View>
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function VendorSignUp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { pendingSignup, cancelSignUp } = useStore();
  const [step, setStep] = React.useState(0);
  const [cuisines, setCuisines] = React.useState<string[]>(["North Indian"]);
  const [confirmed, setConfirmed] = React.useState(false);
  /** documentType -> the file name we put up, so the step can show what is done. */
  const [uploaded, setUploaded] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ applicationId: string; message: string } | null>(
    null
  );

  const [form, setForm] = React.useState<Form>({
    restaurantName: "",
    street: "",
    city: "",
    zipCode: "",
    phone: "",
    email: "",
    contactPersonName: "",
    accountHolderName: "",
    bankName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifsc: "",
    accountType: "",
    latitude: "",
    longitude: "",
    referralCode: "",
  });

  const setField = (key: keyof Form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  /*
   * The number comes from the verification that brought the vendor here, and the
   * proof of it travels with the registration. A vendor with no verified number
   * has nothing to sign up with - the app was restarted, or this screen was
   * opened some other way - and starts again at Login, which is where the number
   * is verified. Not once the application is in: by then the number has done its
   * job and is deliberately gone.
   */
  const phoneProof = pendingSignup?.phoneProof ?? null;
  const verifiedPhone = pendingSignup?.phone.replace(/\D/g, "").slice(-10) ?? "";
  React.useEffect(() => {
    if (verifiedPhone) setField("phone", verifiedPhone);
  }, [verifiedPhone]);
  React.useEffect(() => {
    if (!pendingSignup && !result) router.replace("/login");
  }, [pendingSignup, result, router]);

  /*
   * Finishing a registration that stopped half way: the account exists, so what
   * it already knows is filled in, and its email - which cannot be verified
   * again - is shown rather than asked for.
   */
  const resume = pendingSignup?.resume ?? null;
  const accountEmail = resume?.email ? resume.email : null;
  React.useEffect(() => {
    if (!resume) return;
    setForm((current) => ({
      ...current,
      contactPersonName: current.contactPersonName || resume.name,
      email: accountEmail ?? current.email,
    }));
  }, [resume, accountEmail]);

  React.useEffect(() => {
    if (typeof params.ref === "string" && params.ref.trim()) {
      setField("referralCode", params.ref.trim().toUpperCase());
    }
  }, [params.ref]);

  const toggleCuisine = (name: string) =>
    setCuisines((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
    );

  /**
   * What is missing on the step being shown, or null.
   *
   * Only the documents step is gated here: the fields on the other steps are
   * already checked as they are typed, and the review step has its own
   * confirmation tick.
   */
  const [emailProof, setEmailProof] = React.useState<string | null>(null);

  const missingDocuments = DOCUMENTS.filter(
    (doc) => doc.required && !uploaded[doc.type]
  );

  const stepProblem =
    step === 0 && !emailProof && !accountEmail
      ? "Verify the restaurant's email address to continue."
      : step === 1 && missingDocuments.length > 0
      ? missingDocuments.length === 1
        ? `Upload your ${missingDocuments[0].label} before continuing.`
        : `Still to upload: ${missingDocuments.map((doc) => doc.label).join(", ")}.`
      : null;

  /** Back out of sign-up: forget the verified number and return to Login. */
  const leaveSignUp = () => {
    cancelSignUp();
    router.replace("/login");
  };

  const complete = step === 4;
  const review = step === 3;

  const requiredDocs = DOCUMENTS.filter((doc) => doc.required);
  const allDocsUploaded = requiredDocs.every((doc) => uploaded[doc.type]);

  /**
   * Move on once every required document is in.
   *
   * The brief asks for the step to advance by itself rather than leaving the
   * vendor to work out that they are finished. Only from the documents step,
   * and the delay is there so the last tick is seen before the screen changes.
   */
  React.useEffect(() => {
    if (step !== 1 || !allDocsUploaded) return;
    const timer = setTimeout(() => setStep(2), 700);
    return () => clearTimeout(timer);
  }, [step, allDocsUploaded]);

  /** The three the API refuses without. */
  const missing = !form.restaurantName.trim()
    ? "Enter the restaurant name."
    : !form.city.trim()
      ? "Enter the city."
      : !form.email.trim()
        ? "Enter the restaurant's email address."
        : null;

  const submit = async () => {
    if (missing) {
      setError(missing);
      setStep(0);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const registration = await registerVendor({
        ...form,
        cuisine: cuisines.join(", "),
        emailProof,
        phoneProof,
        referralCode: form.referralCode.trim() || undefined,
      });
      setResult({
        applicationId: registration.applicationId,
        message: registration.message,
      });
      // The number has done its job; the account exists and signs in with it.
      cancelSignUp();
      setStep(4);
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't submit your registration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line bg-surface">
        <PageBar
          title="Vendor Sign Up"
          leading="back"
          onLeading={leaveSignUp}
          right={
            <View className="flex-row items-center gap-1">
              <Ionicons name="headset-outline" size={18} color={colors.brand[600]} />
              <Txt size="sm" weight="bold" tone="brand">
                Help
              </Txt>
            </View>
          }
        />
        <WizardSteps steps={STEPS} current={step} icons={STEP_ICONS} onStep={setStep} />
      </View>

      {error && (
        <View className="flex-row items-start gap-2 border-b border-line bg-bad-soft px-4 py-2.5">
          <Ionicons name="alert-circle" size={15} color={colors.bad.default} />
          <Txt size="tiny" className="flex-1 text-bad-ink">
            {error}
          </Txt>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-6 pt-3">
        {step === 0 && resume && (
          <View className="mb-3">
            <NoteCard
              icon="information-circle"
              tint="amber"
              title="Finish registering your restaurant"
              detail="Your number is verified and your account is set up, but your restaurant was never saved. Fill in its details to finish."
            />
          </View>
        )}
        {step === 0 && (
          <RestaurantStep
            cuisines={cuisines}
            toggleCuisine={toggleCuisine}
            form={form}
            setField={setField}
            emailProof={emailProof}
            setEmailProof={setEmailProof}
            accountEmail={accountEmail}
          />
        )}
        {step === 1 && (
          <>
            <DocumentsStep
              uploaded={uploaded}
              onUploaded={(type, name) =>
                setUploaded((current) => ({ ...current, [type]: name }))
              }
            />
            {/* Named, so the vendor knows which one is holding them up. */}
            {stepProblem && (
              <NoteCard
                icon="alert-circle"
                tint="red"
                title="Documents still needed"
                detail={stepProblem}
              />
            )}
          </>
        )}
        {step === 2 && <BankStep form={form} setField={setField} />}
        {review && (
          <ReviewStep
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            cuisines={cuisines}
            form={form}
            onEditStep={setStep}
          />
        )}
        {complete && <CompleteStep form={form} result={result} />}

        <View className="mt-4 flex-row items-center justify-center gap-1.5">
          <Ionicons name="shield-checkmark" size={13} color={colors.ok.default} />
          <Txt size="tiny" tone="muted">
            Your information is 100% safe and secure with{" "}
            <Txt size="tiny" weight="bold" tone="brand">
              Reditoe.
            </Txt>
          </Txt>
        </View>
      </ScrollView>

      <View className="flex-row gap-2.5 border-t border-line bg-surface px-4 pb-6 pt-3">
        {complete ? (
          <>
            {/*
              Two buttons that went to the same place. Whichever a vendor
              pressed they landed identically, so the choice was decoration.
            */}
            <Button
              label="Go to Home"
              icon="home-outline"
              variant="plain"
              className="flex-1"
              onPress={() => router.replace("/(tabs)")}
            />
            <Button
              label="Go to Login"
              iconRight="chevron-forward"
              className="flex-[1.2]"
              onPress={() => router.replace("/login")}
            />
          </>
        ) : (
          <>
            {step > 0 && (
              <Button
                label="Back"
                icon="chevron-back"
                variant="plain"
                className="flex-1"
                onPress={() => setStep((current) => current - 1)}
              />
            )}
            <Button
              label={busy ? "Submitting…" : review ? "Submit for Verification" : "Save & Continue"}
              iconRight={busy ? undefined : "chevron-forward"}
              loading={busy}
              disabled={(review && !confirmed) || Boolean(stepProblem)}
              className={step > 0 ? "flex-[1.6]" : "flex-1"}
              onPress={() => {
                /*
                 * A step is not finished until it is finished. This used to
                 * increment the step with no check at all, so a restaurant
                 * could be submitted for verification without a single
                 * document against it - and nobody found out until an admin
                 * opened the application and had nothing to approve.
                 */
                if (stepProblem) {
                  setError(stepProblem);
                  return;
                }
                setError(null);
                review ? submit() : setStep((current) => current + 1);
              }}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
