"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  TriangleAlert,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmEmailCode, sendEmailCode } from "@/lib/vendor-api";

/**
 * Vendor sign up.
 *
 * Reached from the sign-in page once the vendor's mobile number has been
 * verified and turned out not to belong to anybody. The number is carried in
 * and shown as verified rather than asked for again; there is no password to
 * choose, since sign-in is by a code sent to that number.
 *
 * Registers the restaurant alongside the account. The generic /auth/register
 * would make a customer and no restaurant, and every screen in this console
 * would then fail with "Restaurant not found" — so this posts to
 * /vendor/register, which creates both.
 */

interface Field {
  id: keyof FormState;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  autoComplete?: string;
  required?: boolean;
}

interface FormState {
  restaurantName: string;
  contactPersonName: string;
  city: string;
  street: string;
  zipCode: string;
  cuisine: string;
}

const EMPTY: FormState = {
  restaurantName: "",
  contactPersonName: "",
  city: "",
  street: "",
  zipCode: "",
  cuisine: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The API requires a restaurant name and a city, plus a verified number and email. */
const FIELDS: Field[] = [
  {
    id: "restaurantName",
    label: "Restaurant name",
    placeholder: "Corner Kitchen",
    icon: Building2,
    required: true,
  },
  {
    id: "contactPersonName",
    label: "Your name",
    placeholder: "Priya Nair",
    icon: User,
    autoComplete: "name",
    required: true,
  },
  {
    id: "city",
    label: "City",
    placeholder: "Chennai",
    icon: MapPin,
    required: true,
  },
  { id: "street", label: "Street", placeholder: "12 Anna Salai", icon: MapPin },
  { id: "zipCode", label: "PIN code", placeholder: "600002", icon: MapPin },
  {
    id: "cuisine",
    label: "Cuisine",
    placeholder: "South Indian",
    icon: UtensilsCrossed,
  },
];

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, pendingSignup, cancelSignUp, status } = useAuth();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /** The email address, and the server's proof that a code sent to it came back. */
  const [email, setEmail] = React.useState("");
  const [emailProof, setEmailProof] = React.useState<string | null>(null);
  const [emailSent, setEmailSent] = React.useState(false);
  const [emailCode, setEmailCode] = React.useState("");
  const [emailNote, setEmailNote] = React.useState<string | null>(null);
  const [emailBusy, setEmailBusy] = React.useState(false);

  // A page with no verified number has nothing to sign up with - it was
  // reloaded, or opened directly - and starts again at sign-in, which is where
  // the number is verified. Not while the request is in flight or once it has
  // succeeded: by then the number has done its job and is deliberately gone.
  const submitted = React.useRef(false);

  /*
   * Finishing a registration that stopped half way: the account exists, so what
   * it knows is filled in, and its email - which a code can no longer be sent
   * to - is shown as verified rather than asked for.
   */
  const resume = pendingSignup?.resume ?? null;
  const accountEmail = resume?.email ? resume.email : null;
  React.useEffect(() => {
    if (!resume) return;
    if (resume.email) setEmail(resume.email);
    if (resume.name) {
      setForm((current) =>
        current.contactPersonName ? current : { ...current, contactPersonName: resume.name }
      );
    }
  }, [resume]);

  React.useEffect(() => {
    if (!pendingSignup && !submitted.current && status !== "authenticated") {
      router.replace("/login");
    }
  }, [pendingSignup, status, router]);

  const set = (id: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [id]: value }));

  /** Changing the address undoes its verification: a tick belongs to one address. */
  const changeEmail = (next: string) => {
    setEmail(next);
    setEmailProof(null);
    setEmailSent(false);
    setEmailCode("");
    setEmailNote(null);
  };

  const sendCode = async () => {
    setEmailBusy(true);
    setEmailNote(null);
    try {
      await sendEmailCode(email);
      setEmailSent(true);
      setEmailNote("We emailed you a 6-digit code.");
    } catch (caught) {
      setEmailNote(caught instanceof ApiError ? caught.message : "Could not send the code.");
    } finally {
      setEmailBusy(false);
    }
  };

  const confirmCode = async () => {
    setEmailBusy(true);
    setEmailNote(null);
    try {
      setEmailProof(await confirmEmailCode(email, emailCode));
    } catch (caught) {
      setEmailNote(caught instanceof ApiError ? caught.message : "That code was not accepted.");
    } finally {
      setEmailBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!emailProof && !accountEmail) {
      setError("Verify your email address to continue.");
      return;
    }

    setBusy(true);
    submitted.current = true;
    try {
      await signUp({
        ...form,
        email: (accountEmail ?? email).trim(),
        emailProof,
      });
    } catch (caught) {
      submitted.current = false;
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not create the account. Please try again."
      );
      setBusy(false);
    }
  };

  const pending = busy || status === "authenticated";

  if (!pendingSignup && status !== "authenticated") return null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center leading-none">
          <span className="text-3xl font-extrabold tracking-tight text-primary">
            Reditoe
          </span>
          <span className="mt-1 text-xs font-bold tracking-[0.14em] text-foreground">
            INDIA LLP
          </span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="h-px w-4 bg-primary/50" />
            <span className="text-[0.625rem] font-semibold tracking-[0.08em] text-primary italic">
              Ready To Eat
            </span>
            <span className="h-px w-4 bg-primary/50" />
          </span>
        </div>

        <div className="surface p-6">
          <h1 className="text-lg font-bold tracking-tight">
            List your restaurant
          </h1>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Create the account and the restaurant together. You can finish the
            menu, documents and bank details afterwards.
          </p>

          {resume && (
            <p className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[0.8125rem]">
              Your number is verified and your account is set up, but your restaurant was
              never saved. Fill in its details to finish.
            </p>
          )}

          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            {/* The number, as verified. Not editable: it is what the account is for. */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Mobile number</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <div className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-muted/50 pr-3 pl-9 text-sm">
                  <span className="font-medium">+91 {pendingSignup?.phone.slice(-10)}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                    <BadgeCheck className="size-4" />
                    Verified
                  </span>
                </div>
              </div>
            </div>

            {FIELDS.map((field) => {
              const Icon = field.icon;
              return (
                <div
                  key={field.id}
                  className={
                    field.id === "restaurantName" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"
                  }
                >
                  <Label htmlFor={field.id}>
                    {field.label}
                    {!field.required && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        optional
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id={field.id}
                      type="text"
                      autoComplete={field.autoComplete}
                      required={field.required}
                      value={form[field.id]}
                      onChange={(event) => set(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}

            {/* The email is proved the way the vendor app proves it: a code to the address. */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  readOnly={Boolean(accountEmail)}
                  onChange={(event) => changeEmail(event.target.value)}
                  placeholder="you@restaurant.com"
                  className={inputClass}
                />
              </div>

              {emailProof || accountEmail ? (
                <p className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <BadgeCheck className="size-4" />
                  {accountEmail ? "Already on your account" : "Verified"}
                </p>
              ) : (
                <div className="space-y-2">
                  {emailSent && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={emailCode}
                        onChange={(event) =>
                          setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="6-digit code"
                        aria-label="Email verification code"
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                      />
                      <Button
                        type="button"
                        onClick={confirmCode}
                        disabled={emailCode.length !== 6 || emailBusy}
                      >
                        Verify
                      </Button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={!EMAIL.test(email.trim()) || emailBusy}
                    className="text-[0.8125rem] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    {emailSent ? "Send a new code" : "Verify this email"}
                  </button>
                </div>
              )}

              {emailNote && <p className="text-xs text-muted-foreground">{emailNote}</p>}
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 sm:col-span-2 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full sm:col-span-2"
              disabled={pending || (!emailProof && !accountEmail)}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-[0.8125rem] text-muted-foreground">
            Already listed with us?{" "}
            <Link
              href="/login"
              onClick={cancelSignUp}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
          API: {API_BASE_URL}
        </p>
      </div>
    </div>
  );
}
