"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  FileText,
  IdCard,
  Info,
  Landmark,
  Lightbulb,
  Loader2,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { VEHICLE_TYPE_OPTIONS } from "@/lib/domain";
import { currency, initials, phone as formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Add Delivery Partner, built to the client's reference screens: a five-step
 * wizard — basic details, documents, bank & payout, vehicle, review — with the
 * onboarding rail beside it.
 *
 * Each step gates Next on the fields the reference marks required, and Review
 * is the only place the partner is created. The POST body keeps everything the
 * previous single-page form sent, so nothing the API already understood
 * changes; the new fields are additive.
 *
 * Documents are the one thing this can't finish: there is no upload endpoint,
 * so a chosen file is held in the form and named back, and the step says so.
 *
 * Creating a partner also mints their sign-in password, which the API returns
 * exactly once — it stores only a hash, so nothing can read it back afterwards.
 * The wizard therefore stops on a handover dialog instead of navigating away:
 * an account whose password was displayed to nobody is an account the rider
 * cannot sign in to, which is precisely what was reported.
 */

interface RiderCredentials {
  email?: string;
  phone?: string;
  password?: string;
  /** False when the admin supplied the password rather than the API minting it. */
  generated?: boolean;
}

const STEPS = [
  { key: "basic", label: "Basic Details" },
  { key: "documents", label: "Documents" },
  { key: "bank", label: "Bank & Payout" },
  { key: "vehicle", label: "Vehicle Details" },
  { key: "review", label: "Review" },
];

const PARTNER_DOCUMENTS = [
  {
    key: "aadhaar",
    label: "Aadhaar Card",
    hint: "Identity proof",
    formats: "JPG, PNG, PDF (max 5MB)",
    icon: IdCard,
  },
  {
    key: "pan",
    label: "PAN Card",
    hint: "Identity proof",
    formats: "JPG, PNG, PDF (max 5MB)",
    icon: IdCard,
  },
  {
    key: "licence",
    label: "Driving License",
    hint: "Valid two-wheeler license",
    formats: "JPG, PNG, PDF (max 5MB)",
    icon: FileText,
  },
  {
    key: "rc",
    label: "RC Book",
    // Often the vehicle is borrowed or in a relative's name.
    hint: "Vehicle registration certificate — optional",
    formats: "JPG, PNG, PDF (max 5MB)",
    icon: FileText,
  },
  {
    key: "photo",
    label: "Passport Size Photo",
    hint: "Clear face photo",
    formats: "JPG, PNG (max 2MB)",
    icon: UserRound,
  },
];

/**
 * The vehicle's papers, as the client asked for them: a photograph of the
 * vehicle, and its insurance if there is any.
 *
 * The RC book, the PUCC and a separate number-plate photo are gone. The RC
 * belongs to whoever owns the vehicle, which is often not the rider, and
 * demanding it kept people who were otherwise ready to ride off the road.
 */
const VEHICLE_DOCUMENTS = [
  {
    key: "vehiclePhoto",
    label: "Vehicle Photo",
    hint: "Clear side view of the vehicle",
    required: true,
  },
  { key: "insurance", label: "Insurance Certificate", hint: "Optional", required: false },
];

const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
];

const PAYOUT_FREQUENCIES = [
  { value: "weekly", label: "Weekly (every Monday)" },
  { value: "daily", label: "Daily" },
  { value: "instant", label: "Instant" },
];

const OWNERSHIP = [
  { value: "owned", label: "Owned" },
  { value: "financed", label: "Financed" },
  { value: "company", label: "Company provided" },
];

/** The platform's cut, used for the payout preview. */
const SERVICE_FEE_PERCENT = 20;

/** Weekly distance band the payout preview brackets against. */
const WEEKLY_KM = { low: 120, high: 180 };

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

interface FormState {
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  emergencyContact: string;
  fullAddress: string;
  landmark: string;
  state: string;
  pincode: string;
  communicationSameAsAddress: boolean;
  communicationAddress: string;
  communicationCity: string;
  communicationLandmark: string;
  communicationState: string;
  communicationPincode: string;
  joiningDate: string;
  city: string;
  active: boolean;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  accountType: string;
  branchName: string;
  payoutMethod: string;
  upiId: string;
  payoutFrequency: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleName: string;
  vehicleNumber: string;
  vehicleColor: string;
  manufactureYear: string;
  insuranceValidTill: string;
  puccValidTill: string;
  ownership: string;
  numberOnRc: string;
  permit: string;
  perKmCharge: string;
}

const EMPTY: FormState = {
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "male",
  emergencyContact: "",
  fullAddress: "",
  landmark: "",
  state: "",
  pincode: "",
  communicationSameAsAddress: true,
  communicationAddress: "",
  communicationCity: "",
  communicationLandmark: "",
  communicationState: "",
  communicationPincode: "",
  joiningDate: "",
  city: "",
  active: true,
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifsc: "",
  accountType: "savings",
  branchName: "",
  payoutMethod: "bank",
  upiId: "",
  payoutFrequency: "weekly",
  vehicleType: "bike",
  vehicleBrand: "",
  vehicleName: "",
  vehicleNumber: "",
  vehicleColor: "",
  manufactureYear: "",
  insuranceValidTill: "",
  puccValidTill: "",
  ownership: "owned",
  numberOnRc: "yes",
  permit: "",
  perKmCharge: "",
};

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Stepper({ current }: { current: number }) {
  return (
    <ol className="surface mb-3 flex flex-wrap items-center gap-y-3 p-4">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold",
                done && "bg-success text-white",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-[0.8125rem]",
                active ? "font-semibold text-primary" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "ml-1 hidden h-px flex-1 sm:block",
                  done ? "bg-success" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[0.75rem] text-danger-foreground">{error}</p>
      ) : hint ? (
        <p className="text-[0.75rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Tinted bullet card, the shape the reference's right rail repeats. */
function InfoCard({
  icon: Icon,
  title,
  tone,
  items,
  numbered,
  children,
}: {
  icon: typeof Info;
  title: string;
  tone: "info" | "warning" | "success";
  items?: string[];
  numbered?: boolean;
  children?: React.ReactNode;
}) {
  const tones = {
    info: "bg-info-muted text-info-foreground",
    warning: "bg-warning-muted text-warning-foreground",
    success: "bg-success-muted text-success-foreground",
  };
  return (
    <div className={cn("rounded-xl p-3.5", tones[tone])}>
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold">
        <Icon className="size-4" />
        {title}
      </p>
      {items && (
        <ol className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={item} className="flex items-start gap-2 text-[0.75rem]">
              {numbered ? (
                <span className="shrink-0 tabular-nums">{index + 1}.</span>
              ) : (
                <Check className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">{item}</span>
            </li>
          ))}
        </ol>
      )}
      {children}
    </div>
  );
}

function DocumentSlot({
  label,
  hint,
  formats,
  icon: Icon,
  file,
  onPick,
  onClear,
}: {
  label: string;
  hint?: string;
  formats?: string;
  icon?: typeof FileText;
  file?: string;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  const inputId = `doc-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium">
            {label}
            <span className="rounded bg-success-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-success-foreground">
              Required
            </span>
          </p>
          {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
          {formats && (
            <p className="text-[0.6875rem] text-muted-foreground">{formats}</p>
          )}
        </div>
        <div className="shrink-0">
          <input
            id={inputId}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) onPick(picked.name);
            }}
          />
          <Button asChild variant="outline" size="sm">
            <label htmlFor={inputId} className="cursor-pointer">
              <Upload className="size-3.5" />
              Upload
            </label>
          </Button>
        </div>
      </div>
      {file && (
        <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-[0.75rem]">
          <BadgeCheck className="size-3.5 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate">{file}</span>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value || "—"}</span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function AddPartnerPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [files, setFiles] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>(
    {}
  );
  const [submitting, setSubmitting] = React.useState(false);
  /** Set once the API returns them; presence is what opens the handover dialog. */
  const [credentials, setCredentials] = React.useState<RiderCredentials | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function pickFile(key: string, name: string) {
    setFiles((previous) => ({ ...previous, [key]: name }));
  }

  function clearFile(key: string) {
    setFiles((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  const uploaded = PARTNER_DOCUMENTS.filter((doc) => files[doc.key]).length;

  function validateStep(index: number) {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (index === 0) {
      if (!form.name.trim()) next.name = "A name is required.";
      if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "")))
        next.phone = "Enter a 10-digit mobile number — it's the login.";
      if (form.email && !/^\S+@\S+\.\S+$/.test(form.email))
        next.email = "That email looks wrong.";
      if (!form.dateOfBirth) next.dateOfBirth = "Date of birth is required.";
      if (!form.emergencyContact.trim())
        next.emergencyContact = "An emergency contact is required.";
      if (!form.fullAddress.trim()) next.fullAddress = "An address is required.";
      if (!form.city.trim()) next.city = "A city is required.";
      if (!form.state.trim()) next.state = "A state is required.";
      if (form.pincode.trim().length !== 6) next.pincode = "Enter a six-digit pincode.";
      if (!form.joiningDate) next.joiningDate = "A joining date is required.";
    }

    if (index === 2) {
      if (!form.accountHolderName.trim())
        next.accountHolderName = "The account holder's name is required.";
      if (!form.bankName) next.bankName = "Pick a bank.";
      if (!form.accountNumber.trim())
        next.accountNumber = "An account number is required.";
      if (form.confirmAccountNumber !== form.accountNumber)
        next.confirmAccountNumber = "The two account numbers don't match.";
      if (!IFSC_PATTERN.test(form.ifsc.trim()))
        next.ifsc = "IFSC should look like HDFC0001234.";
      if (!form.branchName.trim()) next.branchName = "A branch name is required.";
      if (form.payoutMethod === "upi" && !form.upiId.trim())
        next.upiId = "A UPI ID is required for UPI payouts.";
    }

    if (index === 3) {
      if (!form.vehicleType) next.vehicleType = "Pick a vehicle type.";
      if (!form.vehicleName.trim()) next.vehicleName = "A model is required.";
      if (!form.vehicleNumber.trim())
        next.vehicleNumber = "The number plate is needed for verification.";
      if (!form.manufactureYear) next.manufactureYear = "A year is required.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) {
      toast.error("Fix the highlighted fields.");
      return;
    }
    if (step === 1 && uploaded < PARTNER_DOCUMENTS.length) {
      const missing = PARTNER_DOCUMENTS.length - uploaded;
      toast.warning(
        `${missing} document${missing === 1 ? "" : "s"} still to attach — they can be added after approval.`
      );
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit() {
    // Re-run every gated step, in case a field was cleared after passing it.
    for (const index of [0, 2, 3]) {
      if (!validateStep(index)) {
        setStep(index);
        toast.error("Fix the highlighted fields.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await api.post<{ credentials?: RiderCredentials }>("/admin/riders", {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.replace(/\D/g, ""),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        emergencyContact: form.emergencyContact.trim() || undefined,
        fullAddress: form.fullAddress.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        state: form.state.trim() || undefined,
        pincode: form.pincode.trim() || undefined,
        // Resolved here, so whichever way the box is ticked one address is sent.
        communicationAddress: form.communicationSameAsAddress
          ? form.fullAddress.trim()
          : form.communicationAddress.trim(),
        communicationCity: form.communicationSameAsAddress
          ? form.city.trim()
          : form.communicationCity.trim(),
        communicationLandmark: form.communicationSameAsAddress
          ? form.landmark.trim()
          : form.communicationLandmark.trim(),
        communicationState: form.communicationSameAsAddress
          ? form.state.trim()
          : form.communicationState.trim(),
        communicationPincode: form.communicationSameAsAddress
          ? form.pincode.trim()
          : form.communicationPincode.trim(),
        communicationSameAsAddress: form.communicationSameAsAddress,
        city: form.city || undefined,
        joiningDate: form.joiningDate || undefined,
        isActive: form.active,
        vehicleType: form.vehicleType,
        vehicleName:
          [form.vehicleBrand, form.vehicleName].filter(Boolean).join(" ").trim() ||
          undefined,
        vehicleNumber: form.vehicleNumber.trim(),
        vehicleColor: form.vehicleColor.trim() || undefined,
        manufactureYear: form.manufactureYear || undefined,
        insuranceValidTill: form.insuranceValidTill || undefined,
        puccValidTill: form.puccValidTill || undefined,
        ownership: form.ownership,
        perKmCharge: form.perKmCharge ? Number(form.perKmCharge) : undefined,
        payoutFrequency: form.payoutFrequency,
        bankDetails: {
          accountHolderName: form.accountHolderName.trim() || undefined,
          accountNumber: form.accountNumber.trim() || undefined,
          ifsc: form.ifsc.trim().toUpperCase() || undefined,
          bankName: form.bankName || undefined,
          branchName: form.branchName.trim() || undefined,
          accountType: form.accountType,
          upiId: form.upiId.trim() || undefined,
        },
      });

      const attached = Object.keys(files).length;
      toast.success(
        attached > 0
          ? `${form.name} added — ${attached} document${attached === 1 ? "" : "s"} still to upload.`
          : `${form.name} added`
      );

      // The password is readable this once and never again. Hold the wizard
      // here so it can be handed over; leaving for /partners would lose it.
      if (created?.credentials?.password) {
        setCredentials(created.credentials);
        return;
      }
      router.push("/partners");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the partner"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const perKm = Number(form.perKmCharge) || 0;
  const weeklyLow = perKm * WEEKLY_KM.low;
  const weeklyHigh = perKm * WEEKLY_KM.high;
  const partnerShare = (100 - SERVICE_FEE_PERCENT) / 100;

  return (
    <>
      <PageHeader
        title="Add Delivery Partner"
        description="Register a new delivery partner to the platform."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Delivery Partners", href: "/partners" },
          { label: "Add Delivery Partner" },
        ]}
      />

      <Stepper current={step} />

      <div className="grid items-start gap-3 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          {step === 0 && (
            <>
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <UserRound className="size-4 text-muted-foreground" />
                    Basic Information
                  </span>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full Name" htmlFor="name" required error={errors.name}>
                    <Input
                      id="name"
                      value={form.name}
                      placeholder="Enter partner full name"
                      onChange={(event) => set("name", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Phone Number"
                    htmlFor="phone"
                    required
                    error={errors.phone}
                  >
                    <div className="flex gap-2">
                      <span className="flex items-center rounded-lg border border-input px-2.5 text-[0.8125rem] text-muted-foreground">
                        +91
                      </span>
                      <Input
                        id="phone"
                        inputMode="numeric"
                        value={form.phone}
                        placeholder="Enter 10 digit mobile number"
                        onChange={(event) => set("phone", event.target.value)}
                      />
                    </div>
                  </Field>
                  <Field
                    label="Email ID (Optional)"
                    htmlFor="email"
                    error={errors.email}
                  >
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      placeholder="Enter email address"
                      onChange={(event) => set("email", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Date of Birth"
                    htmlFor="dob"
                    required
                    error={errors.dateOfBirth}
                  >
                    <Input
                      id="dob"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => set("dateOfBirth", event.target.value)}
                    />
                  </Field>
                  <Field label="Gender" required>
                    <RadioGroup
                      value={form.gender}
                      onValueChange={(value) => set("gender", value)}
                      className="flex flex-wrap gap-4 pt-1.5"
                    >
                      {["male", "female", "other"].map((option) => (
                        <div key={option} className="flex items-center gap-2">
                          <RadioGroupItem value={option} id={`gender-${option}`} />
                          <Label htmlFor={`gender-${option}`} className="font-normal">
                            {option[0].toUpperCase() + option.slice(1)}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </Field>
                  <Field
                    label="Emergency Contact"
                    htmlFor="emergency"
                    required
                    error={errors.emergencyContact}
                  >
                    <Input
                      id="emergency"
                      inputMode="numeric"
                      value={form.emergencyContact}
                      placeholder="Enter emergency contact number"
                      onChange={(event) => set("emergencyContact", event.target.value)}
                    />
                  </Field>
                  {/*
                    The address in parts rather than one free-text box.
                    
                    A single field cannot be searched by city, sorted by
                    pincode or posted to reliably, and a "preferred zone"
                    picked from a fixed list said where somebody wanted to
                    work rather than where they live.
                  */}
                  <Field
                    label="Address"
                    htmlFor="address"
                    required
                    error={errors.fullAddress}
                    className="sm:col-span-2"
                  >
                    <Textarea
                      id="address"
                      rows={2}
                      maxLength={200}
                      value={form.fullAddress}
                      placeholder="House, street, area"
                      onChange={(event) => set("fullAddress", event.target.value)}
                    />
                  </Field>
                  <Field label="City" htmlFor="city" required error={errors.city}>
                    <Input
                      id="city"
                      value={form.city}
                      placeholder="Tirupati"
                      onChange={(event) => set("city", event.target.value)}
                    />
                  </Field>
                  <Field label="Landmark" htmlFor="landmark">
                    <Input
                      id="landmark"
                      value={form.landmark}
                      placeholder="Near the railway station"
                      onChange={(event) => set("landmark", event.target.value)}
                    />
                  </Field>
                  <Field label="State" htmlFor="state" required error={errors.state}>
                    <Input
                      id="state"
                      value={form.state}
                      placeholder="Andhra Pradesh"
                      onChange={(event) => set("state", event.target.value)}
                    />
                  </Field>
                  <Field label="Pincode" htmlFor="pincode" required error={errors.pincode}>
                    <Input
                      id="pincode"
                      inputMode="numeric"
                      maxLength={6}
                      value={form.pincode}
                      placeholder="517501"
                      onChange={(event) =>
                        set("pincode", event.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                      }
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.communicationSameAsAddress}
                        onChange={(event) =>
                          set("communicationSameAsAddress", event.target.checked)
                        }
                      />
                      <span className="text-[0.8125rem]">
                        Communication address is the same as the permanent address
                      </span>
                    </label>
                  </div>

                  {!form.communicationSameAsAddress && (
                    <>
                      <Field
                        label="Communication address"
                        htmlFor="comm-address"
                        className="sm:col-span-2"
                      >
                        <Textarea
                          id="comm-address"
                          rows={2}
                          maxLength={200}
                          value={form.communicationAddress}
                          placeholder="House, street, area"
                          onChange={(event) => set("communicationAddress", event.target.value)}
                        />
                      </Field>
                      <Field label="Communication city" htmlFor="comm-city">
                        <Input
                          id="comm-city"
                          value={form.communicationCity}
                          onChange={(event) => set("communicationCity", event.target.value)}
                        />
                      </Field>
                      <Field label="Communication landmark" htmlFor="comm-landmark">
                        <Input
                          id="comm-landmark"
                          value={form.communicationLandmark}
                          onChange={(event) => set("communicationLandmark", event.target.value)}
                        />
                      </Field>
                      <Field label="Communication state" htmlFor="comm-state">
                        <Input
                          id="comm-state"
                          value={form.communicationState}
                          onChange={(event) => set("communicationState", event.target.value)}
                        />
                      </Field>
                      <Field label="Communication pincode" htmlFor="comm-pincode">
                        <Input
                          id="comm-pincode"
                          inputMode="numeric"
                          maxLength={6}
                          value={form.communicationPincode}
                          onChange={(event) =>
                            set(
                              "communicationPincode",
                              event.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                            )
                          }
                        />
                      </Field>
                    </>
                  )}
                </div>
              </Panel>

              <Panel title="Working Preferences">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Joining Date"
                    htmlFor="joining"
                    required
                    error={errors.joiningDate}
                  >
                    <Input
                      id="joining"
                      type="date"
                      value={form.joiningDate}
                      onChange={(event) => set("joiningDate", event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-[0.8125rem] font-medium">Partner Status</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Switch
                      id="active"
                      checked={form.active}
                      onCheckedChange={(value) => set("active", value)}
                    />
                    <Label htmlFor="active" className="font-normal">
                      {form.active ? "Active" : "Inactive"}
                    </Label>
                  </div>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    Partner can log in and start taking orders after approval.
                  </p>
                </div>
              </Panel>
            </>
          )}

          {step === 1 && (
            <Panel
              title="Required Documents"
              description="Upload clear and valid documents for verification."
              action={
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums">
                  {uploaded} / {PARTNER_DOCUMENTS.length} attached
                </span>
              }
            >
              <p className="mb-3 flex items-start gap-2 rounded-lg bg-warning-muted px-3 py-2.5 text-[0.75rem] text-warning-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                There is no document upload endpoint yet, so a file chosen here is held
                in this form and named back — it is not transmitted. The partner can
                still be created and the documents added later.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {PARTNER_DOCUMENTS.map((doc) => (
                  <DocumentSlot
                    key={doc.key}
                    label={doc.label}
                    hint={doc.hint}
                    formats={doc.formats}
                    icon={doc.icon}
                    file={files[doc.key]}
                    onPick={(name) => pickFile(doc.key, name)}
                    onClear={() => clearFile(doc.key)}
                  />
                ))}
              </div>
            </Panel>
          )}

          {step === 2 && (
            <>
              <Panel
                title="Bank Account Details"
                description="Provide bank account details for payouts."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Account Holder Name"
                    htmlFor="holder"
                    required
                    error={errors.accountHolderName}
                  >
                    <Input
                      id="holder"
                      value={form.accountHolderName}
                      onChange={(event) => set("accountHolderName", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Bank Name"
                    htmlFor="bank"
                    required
                    error={errors.bankName}
                  >
                    <Select
                      value={form.bankName}
                      onValueChange={(value) => set("bankName", value)}
                    >
                      <SelectTrigger id="bank" className="w-full">
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANKS.map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Account Number"
                    htmlFor="account"
                    required
                    error={errors.accountNumber}
                  >
                    <Input
                      id="account"
                      inputMode="numeric"
                      value={form.accountNumber}
                      onChange={(event) => set("accountNumber", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Confirm Account Number"
                    htmlFor="account-confirm"
                    required
                    error={errors.confirmAccountNumber}
                  >
                    <Input
                      id="account-confirm"
                      inputMode="numeric"
                      value={form.confirmAccountNumber}
                      onChange={(event) =>
                        set("confirmAccountNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="IFSC Code" htmlFor="ifsc" required error={errors.ifsc}>
                    <div className="relative">
                      <Input
                        id="ifsc"
                        value={form.ifsc}
                        placeholder="HDFC0001234"
                        onChange={(event) =>
                          set("ifsc", event.target.value.toUpperCase())
                        }
                      />
                      {IFSC_PATTERN.test(form.ifsc.trim()) && (
                        <span className="absolute inset-y-0 right-2.5 flex items-center rounded bg-success-muted px-1.5 text-[0.625rem] font-semibold text-success-foreground">
                          Valid
                        </span>
                      )}
                    </div>
                  </Field>
                  <Field label="Account Type" required>
                    <RadioGroup
                      value={form.accountType}
                      onValueChange={(value) => set("accountType", value)}
                      className="flex flex-wrap gap-4 pt-1.5"
                    >
                      {["savings", "current"].map((option) => (
                        <div key={option} className="flex items-center gap-2">
                          <RadioGroupItem value={option} id={`account-${option}`} />
                          <Label htmlFor={`account-${option}`} className="font-normal">
                            {option[0].toUpperCase() + option.slice(1)}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </Field>
                  <Field
                    label="Branch Name"
                    htmlFor="branch"
                    required
                    error={errors.branchName}
                  >
                    <Input
                      id="branch"
                      value={form.branchName}
                      onChange={(event) => set("branchName", event.target.value)}
                    />
                  </Field>
                </div>
                {/*
                  A passbook or cancelled cheque, filed where the account it
                  proves is entered. There was nowhere to upload one at all,
                  so an account number was taken on trust and a typo in it
                  sent somebody's wages to a stranger.
                */}
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-[0.8125rem] font-medium">
                    Passbook or cancelled cheque
                    <span className="ml-1 text-destructive">*</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Proof that the account above belongs to this partner.
                  </p>
                  <div className="mt-2">
                    <DocumentSlot
                      label="Passbook / cancelled cheque"
                      hint="Proof of the account above"
                      formats="JPG, PNG, PDF (max 5MB)"
                      icon={FileText}
                      file={files.passbook}
                      onPick={(name) => pickFile("passbook", name)}
                      onClear={() => clearFile("passbook")}
                    />
                  </div>
                </div>
              </Panel>

              <Panel
                title="Payout Preferences"
                description="Choose how the partner receives their earnings."
              >
                <RadioGroup
                  value={form.payoutMethod}
                  onValueChange={(value) => set("payoutMethod", value)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {[
                    {
                      value: "bank",
                      icon: Landmark,
                      title: "Bank Transfer (NEFT/IMPS)",
                      hint: "Paid directly into the bank account.",
                    },
                    {
                      value: "upi",
                      icon: ShieldCheck,
                      title: "UPI (Optional)",
                      hint: "Paid to the partner's UPI ID.",
                    },
                  ].map(({ value, icon: Icon, title, hint }) => (
                    <label
                      key={value}
                      htmlFor={`payout-${value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                        form.payoutMethod === value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] font-medium">
                          {title}
                        </span>
                        <span className="block text-[0.6875rem] text-muted-foreground">
                          {hint}
                        </span>
                      </span>
                      <RadioGroupItem
                        value={value}
                        id={`payout-${value}`}
                        className="mt-0.5"
                      />
                    </label>
                  ))}
                </RadioGroup>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="UPI ID" htmlFor="upi" error={errors.upiId}>
                    <Input
                      id="upi"
                      value={form.upiId}
                      placeholder="e.g. ramesh@upi"
                      onChange={(event) => set("upiId", event.target.value)}
                    />
                  </Field>
                  <Field label="Payout Frequency" htmlFor="frequency" required>
                    <Select
                      value={form.payoutFrequency}
                      onValueChange={(value) => set("payoutFrequency", value)}
                    >
                      <SelectTrigger id="frequency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYOUT_FREQUENCIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Panel>
            </>
          )}

          {step === 3 && (
            <>
              <Panel
                title="Vehicle Information"
                description="Enter the vehicle used for deliveries."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Vehicle Type"
                    htmlFor="vehicle-type"
                    required
                    error={errors.vehicleType}
                  >
                    <Select
                      value={form.vehicleType}
                      onValueChange={(value) => set("vehicleType", value)}
                    >
                      <SelectTrigger id="vehicle-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Vehicle Brand" htmlFor="vehicle-brand">
                    <Input
                      id="vehicle-brand"
                      value={form.vehicleBrand}
                      placeholder="e.g. Honda"
                      onChange={(event) => set("vehicleBrand", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Vehicle Model"
                    htmlFor="vehicle-model"
                    required
                    error={errors.vehicleName}
                  >
                    <Input
                      id="vehicle-model"
                      value={form.vehicleName}
                      placeholder="e.g. Activa 6G"
                      onChange={(event) => set("vehicleName", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Registration Number"
                    htmlFor="vehicle-number"
                    required
                    error={errors.vehicleNumber}
                  >
                    <Input
                      id="vehicle-number"
                      value={form.vehicleNumber}
                      placeholder="AP 39 AB 1234"
                      onChange={(event) =>
                        set("vehicleNumber", event.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="Vehicle Colour" htmlFor="vehicle-colour">
                    <Input
                      id="vehicle-colour"
                      value={form.vehicleColor}
                      placeholder="e.g. Black"
                      onChange={(event) => set("vehicleColor", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Year of Manufacture"
                    htmlFor="vehicle-year"
                    required
                    error={errors.manufactureYear}
                  >
                    <Input
                      id="vehicle-year"
                      inputMode="numeric"
                      value={form.manufactureYear}
                      placeholder="e.g. 2022"
                      onChange={(event) => set("manufactureYear", event.target.value)}
                    />
                  </Field>
                  <Field label="Insurance Valid Till" htmlFor="insurance">
                    <Input
                      id="insurance"
                      type="date"
                      value={form.insuranceValidTill}
                      onChange={(event) =>
                        set("insuranceValidTill", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="PUCC Valid Till" htmlFor="pucc">
                    <Input
                      id="pucc"
                      type="date"
                      value={form.puccValidTill}
                      onChange={(event) => set("puccValidTill", event.target.value)}
                    />
                  </Field>
                  <Field label="Vehicle Ownership" required className="sm:col-span-2">
                    <RadioGroup
                      value={form.ownership}
                      onValueChange={(value) => set("ownership", value)}
                      className="flex flex-wrap gap-4 pt-1.5"
                    >
                      {OWNERSHIP.map((option) => (
                        <div key={option.value} className="flex items-center gap-2">
                          <RadioGroupItem
                            value={option.value}
                            id={`own-${option.value}`}
                          />
                          <Label htmlFor={`own-${option.value}`} className="font-normal">
                            {option.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </Field>
                </div>

                <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-muted px-3 py-2.5 text-[0.75rem] text-info-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  Ensure the vehicle is in good condition and the documents are valid.
                </p>

                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-[0.8125rem] font-medium">Other Information</p>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <Field label="Vehicle Number on RC" htmlFor="on-rc">
                      <Select
                        value={form.numberOnRc}
                        onValueChange={(value) => set("numberOnRc", value)}
                      >
                        <SelectTrigger id="on-rc" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Vehicle Sticker / Permit (if any)" htmlFor="permit">
                      <Input
                        id="permit"
                        value={form.permit}
                        placeholder="Enter sticker/permit details (optional)"
                        onChange={(event) => set("permit", event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Per-kilometre charge (₹)"
                      htmlFor="per-km"
                      hint="Drives the payout preview on the previous step."
                    >
                      <Input
                        id="per-km"
                        inputMode="numeric"
                        value={form.perKmCharge}
                        onChange={(event) => set("perKmCharge", event.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </Panel>

              <Panel title="Documents Upload" description="Vehicle-related documents.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {VEHICLE_DOCUMENTS.map((doc) => (
                    <DocumentSlot
                      key={doc.key}
                      label={doc.label}
                      hint={doc.hint || undefined}
                      formats="JPG, PNG, PDF (max 5MB)"
                      icon={FileText}
                      file={files[doc.key]}
                      onPick={(name) => pickFile(doc.key, name)}
                      onClear={() => clearFile(doc.key)}
                    />
                  ))}
                </div>
              </Panel>
            </>
          )}

          {step === 4 && (
            <>
              <Panel title="Basic Details">
                <ReviewRow label="Full Name" value={form.name} />
                <ReviewRow label="Phone Number" value={formatPhone(form.phone)} />
                <ReviewRow label="Email ID" value={form.email} />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth} />
                <ReviewRow
                  label="Gender"
                  value={form.gender[0].toUpperCase() + form.gender.slice(1)}
                />
                <ReviewRow
                  label="Emergency Contact"
                  value={formatPhone(form.emergencyContact)}
                />
                <ReviewRow label="Current Address" value={form.fullAddress} />
                <ReviewRow label="Joining Date" value={form.joiningDate} />
                <ReviewRow
                  label="Partner Status"
                  value={form.active ? "Active" : "Inactive"}
                />
              </Panel>

              <Panel title="Bank & Payout">
                <ReviewRow label="Account Holder" value={form.accountHolderName} />
                <ReviewRow label="Bank" value={form.bankName} />
                <ReviewRow
                  label="Account Number"
                  value={
                    form.accountNumber
                      ? `•••• ${form.accountNumber.slice(-4)}`
                      : undefined
                  }
                />
                <ReviewRow label="IFSC" value={form.ifsc.toUpperCase()} />
                <ReviewRow label="Branch" value={form.branchName} />
                <ReviewRow
                  label="Account Type"
                  value={form.accountType[0].toUpperCase() + form.accountType.slice(1)}
                />
                <ReviewRow
                  label="Payout Method"
                  value={form.payoutMethod === "upi" ? "UPI" : "Bank transfer"}
                />
                <ReviewRow label="UPI ID" value={form.upiId} />
                <ReviewRow
                  label="Payout Frequency"
                  value={
                    PAYOUT_FREQUENCIES.find(
                      (option) => option.value === form.payoutFrequency
                    )?.label
                  }
                />
              </Panel>

              <Panel title="Vehicle">
                <ReviewRow
                  label="Vehicle"
                  value={[form.vehicleBrand, form.vehicleName]
                    .filter(Boolean)
                    .join(" ")}
                />
                <ReviewRow label="Type" value={form.vehicleType} />
                <ReviewRow label="Registration Number" value={form.vehicleNumber} />
                <ReviewRow label="Colour" value={form.vehicleColor} />
                <ReviewRow label="Year" value={form.manufactureYear} />
                <ReviewRow
                  label="Insurance Valid Till"
                  value={form.insuranceValidTill}
                />
                <ReviewRow label="PUCC Valid Till" value={form.puccValidTill} />
                <ReviewRow
                  label="Ownership"
                  value={
                    OWNERSHIP.find((option) => option.value === form.ownership)?.label
                  }
                />
              </Panel>

              <Panel
                title="Documents"
                action={
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums">
                    {Object.keys(files).length} attached
                  </span>
                }
              >
                {Object.keys(files).length === 0 ? (
                  <p className="text-[0.8125rem] text-muted-foreground">
                    Nothing attached. Documents can be added after approval.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {Object.entries(files).map(([key, name]) => (
                      <li
                        key={key}
                        className="flex items-center gap-2 text-[0.8125rem]"
                      >
                        <BadgeCheck className="size-3.5 shrink-0 text-emerald-600" />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[0.75rem] text-muted-foreground">
                  Attached files are not sent with this form — there is no upload
                  endpoint yet.
                </p>
              </Panel>
            </>
          )}

          <div className="surface flex flex-wrap items-center justify-between gap-2 p-4">
            {step === 0 ? (
              <Button variant="outline" onClick={() => router.push("/partners")}>
                <X className="size-4" />
                Cancel
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}

            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>
                Next: {STEPS[step + 1].label}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button disabled={submitting} onClick={submit}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Create Partner
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {form.name && (
            <Panel title="Partner Summary">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-10">
                  <AvatarFallback>{initials(form.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-semibold">{form.name}</p>
                  <p className="truncate text-[0.75rem] text-muted-foreground">
                    {formatPhone(form.phone)}
                  </p>
                </div>
              </div>

              <ol className="mt-3 space-y-2 border-t border-border pt-3">
                {STEPS.map((entry, index) => {
                  const done = index < step;
                  const active = index === step;
                  return (
                    <li
                      key={entry.key}
                      className="flex items-center gap-2 text-[0.8125rem]"
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold",
                          done && "bg-success text-white",
                          active && "bg-primary text-primary-foreground",
                          !done && !active && "bg-muted text-muted-foreground"
                        )}
                      >
                        {done ? <Check className="size-3" /> : index + 1}
                      </span>
                      <span className={cn(active && "font-medium")}>{entry.label}</span>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}

          {step === 0 && (
            <InfoCard
              icon={ShieldCheck}
              tone="info"
              title="Partner Onboarding"
              items={[
                "Start earning immediately after approval",
                "Flexible working hours",
                "Weekly or instant payouts",
                "Insurance coverage",
                "24/7 support",
              ]}
            />
          )}

          {step === 1 && (
            <InfoCard
              icon={Lightbulb}
              tone="warning"
              numbered
              title="Tips"
              items={[
                "Upload clear and readable documents",
                "Ensure all documents are valid",
                "The bank account must be in the partner's name",
                "A complete profile is approved faster",
              ]}
            />
          )}

          {step === 2 && (
            <>
              <InfoCard
                icon={Info}
                tone="info"
                title="Important Information"
                items={[
                  "Payouts run every Monday for the previous week's earnings",
                  "Minimum payout threshold is ₹200",
                  "The bank account must be active and KYC verified",
                  "Payouts may take up to 24 hours to reflect",
                ]}
              />
              <InfoCard icon={ShieldCheck} tone="success" title="Secure & Safe">
                <p className="mt-1.5 text-[0.75rem]">
                  Bank details are encrypted in transit, and the full account number is
                  never shown back after saving.
                </p>
              </InfoCard>
              <Panel title="Payout Preview">
                {perKm > 0 ? (
                  <>
                    <p className="text-[0.75rem] text-muted-foreground">
                      Estimated weekly earnings
                    </p>
                    <p
                      data-numeric
                      className="text-lg font-semibold tracking-tight text-emerald-600"
                    >
                      {currency(weeklyLow)} – {currency(weeklyHigh)}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      At {WEEKLY_KM.low}–{WEEKLY_KM.high} km a week, from the
                      per-kilometre charge set on the vehicle step.
                    </p>
                    <div className="mt-3 border-t border-border pt-2">
                      <ReviewRow
                        label="Service fee (platform)"
                        value={`${SERVICE_FEE_PERCENT}%`}
                      />
                      <ReviewRow
                        label="Partner receives"
                        value={`${100 - SERVICE_FEE_PERCENT}%`}
                      />
                      <ReviewRow
                        label="Estimated payout"
                        value={`${currency(weeklyLow * partnerShare)} – ${currency(
                          weeklyHigh * partnerShare
                        )}`}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[0.8125rem] text-muted-foreground">
                    Set a per-kilometre charge on the vehicle step and the estimated
                    payout appears here.
                  </p>
                )}
              </Panel>
            </>
          )}

          {step === 3 && (
            <InfoCard
              icon={Lightbulb}
              tone="warning"
              numbered
              title="Tips"
              items={[
                "RC and insurance must be valid",
                "Upload clear and readable documents",
                "The vehicle photo should be clearly visible",
                "Incorrect details may cause rejection",
              ]}
            />
          )}

          {step === 4 && (
            <InfoCard icon={Info} tone="info" title="Before you create">
              <p className="mt-1.5 text-[0.75rem]">
                Creating the partner registers them against the platform. They can log
                in with their phone number and start taking orders once approved.
              </p>
            </InfoCard>
          )}
        </div>
      </div>

      <CredentialsDialog
        credentials={credentials}
        name={form.name}
        onClose={() => router.push("/partners")}
      />
    </>
  );
}

/**
 * The one and only sight of a new partner's password.
 *
 * It cannot be dismissed by clicking away or pressing Escape — closing it goes
 * to the partner list, and there is no route back to the password, so a stray
 * click must not be able to lose it.
 */
function CredentialsDialog({
  credentials,
  name,
  onClose,
}: {
  credentials: RiderCredentials | null;
  name: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  if (!credentials) return null;

  const signIn = credentials.phone || credentials.email || "";
  const summary = [
    `Reditoe delivery partner login`,
    `Sign in: ${signIn}`,
    credentials.email && credentials.phone ? `Email: ${credentials.email}` : "",
    `Password: ${credentials.password}`,
  ]
    .filter(Boolean)
    .join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast.success("Credentials copied");
    } catch {
      toast.error("Could not copy — select the text and copy it by hand.");
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Login details for {name || "the new partner"}</DialogTitle>
          <DialogDescription>
            {credentials.generated
              ? "This password was generated for them and is shown only now — the platform stores a hash of it and cannot show it again."
              : "The password you set, shown for handover. It cannot be read back later."}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border rounded-lg border border-border text-[0.8125rem]">
          <div className="flex items-baseline gap-3 px-3 py-2.5">
            <dt className="w-24 shrink-0 text-muted-foreground">Sign in with</dt>
            <dd className="min-w-0 flex-1 font-medium break-all">{signIn}</dd>
          </div>
          {credentials.email && credentials.phone && (
            <div className="flex items-baseline gap-3 px-3 py-2.5">
              <dt className="w-24 shrink-0 text-muted-foreground">Email</dt>
              <dd className="min-w-0 flex-1 break-all">{credentials.email}</dd>
            </div>
          )}
          <div className="flex items-baseline gap-3 px-3 py-2.5">
            <dt className="w-24 shrink-0 text-muted-foreground">Password</dt>
            <dd className="min-w-0 flex-1 font-mono font-semibold break-all">
              {credentials.password}
            </dd>
          </div>
        </dl>

        <p className="flex items-start gap-2 text-[0.75rem] text-muted-foreground">
          <CircleAlert className="mt-px size-3.5 shrink-0 text-amber-600" />
          Pass these to the partner over a channel they control. They sign in on the
          delivery app and should change the password once they are in.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check className="size-4" /> : <FileText className="size-4" />}
            {copied ? "Copied" : "Copy details"}
          </Button>
          <Button onClick={onClose}>
            Done — I have saved these
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
