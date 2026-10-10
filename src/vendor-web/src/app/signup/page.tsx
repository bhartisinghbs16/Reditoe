"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Loader2,
  LockKeyhole,
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

/**
 * Vendor sign up.
 *
 * Registers the restaurant alongside the account. The generic /auth/register
 * would make a user with role "vendor" and no restaurant, and every screen in
 * this console then fails with "Restaurant not found" — so this posts to
 * /vendor/register, which creates both.
 */

interface Field {
  id: keyof FormState;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}

interface FormState {
  restaurantName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  street: string;
  zipCode: string;
  cuisine: string;
}

const EMPTY: FormState = {
  restaurantName: "",
  contactPersonName: "",
  email: "",
  phone: "",
  password: "",
  city: "",
  street: "",
  zipCode: "",
  cuisine: "",
};

/** The API requires a restaurant name and a city, plus an email or a phone. */
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
    id: "email",
    label: "Email",
    placeholder: "you@restaurant.com",
    icon: Mail,
    type: "email",
    autoComplete: "username",
    required: true,
  },
  {
    id: "phone",
    label: "Phone",
    placeholder: "9800000000",
    icon: Phone,
    type: "tel",
    autoComplete: "tel",
    required: true,
  },
  {
    id: "password",
    label: "Password",
    placeholder: "At least 8 characters",
    icon: LockKeyhole,
    type: "password",
    autoComplete: "new-password",
    required: true,
    hint: "You will sign in with this.",
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

const MIN_PASSWORD = 8;

export default function SignUpPage() {
  const { signUp, status } = useAuth();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const set = (id: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [id]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (form.password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      const created = await signUp(form);
      if (!created) {
        // Signed in rather than registered — saying "welcome, you're set up" to
        // someone who already had an account would be a lie they'd notice.
        setNotice("You already had an account here — signing you in instead.");
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not create the account. Please try again."
      );
      setBusy(false);
    }
  };

  const pending = busy || status === "authenticated";

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

          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
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
                      type={field.type ?? "text"}
                      autoComplete={field.autoComplete}
                      required={field.required}
                      value={form[field.id]}
                      onChange={(event) => set(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                    />
                  </div>
                  {field.hint && (
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  )}
                </div>
              );
            })}

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 sm:col-span-2 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            {notice && (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-700 sm:col-span-2 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                {notice}
              </p>
            )}

            <Button
              type="submit"
              className="w-full sm:col-span-2"
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-[0.8125rem] text-muted-foreground">
            Already listed with us?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
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
