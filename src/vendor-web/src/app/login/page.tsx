"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Vendor sign-in, and the way into sign-up.
 *
 * One way in: a mobile number and the code texted to it. There is no password.
 * It is also where a new restaurant starts - once the number is verified the
 * server says whether anybody has it, and a number nobody has is taken on to
 * the sign-up form. So the page never asks "are you new?", and cannot be used
 * to find out who is.
 */

/** Ten digits starting 6-9 — the ranges Indian mobile numbers actually use. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const tenDigits = (value: string) => value.replace(/\D/g, "").slice(-10);

/** How long to wait for another code when the server does not say. */
const DEFAULT_RESEND_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const { requestOtp, verifyOtp, cancelSignUp, status } = useAuth();

  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** Seconds until another code can be asked for; the server sets the cooldown. */
  const [resendIn, setResendIn] = React.useState(0);

  // Arriving here starts a sign-in afresh: a number half way through signing up
  // on an earlier visit must not be carried into this one.
  React.useEffect(() => {
    cancelSignUp();
  }, [cancelSignUp]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const validNumber = INDIAN_MOBILE.test(tenDigits(phone));

  /** Back to the number, discarding a code that was meant for another one. */
  const changeNumber = (next: string) => {
    setPhone(next.replace(/\D/g, "").slice(0, 10));
    if (otpSent) {
      setOtpSent(false);
      setOtp("");
      setNotice(null);
      setResendIn(0);
    }
  };

  const askForCode = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const sent = await requestOtp(tenDigits(phone));
      setOtpSent(true);
      setResendIn(sent.resendAfterSeconds ?? DEFAULT_RESEND_SECONDS);
      if (sent.devOtp) {
        // The server had no way to text it (never the case in production).
        setOtp(sent.devOtp);
        setNotice("This server cannot send texts, so the code is filled in for you.");
      } else {
        setOtp("");
        setNotice(`We've texted a 6-digit code to +91 ${tenDigits(phone)}.`);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not send the code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpSent) {
      await askForCode();
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const outcome = await verifyOtp(tenDigits(phone), otp.trim());
      // A vendor with an account is signed in and the shell redirects to the
      // dashboard; a number nobody has goes on to sign up.
      if (outcome === "new") router.push("/signup");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not sign in. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // The redirect to /dashboard is the shell's job; until it fires, keep the
  // button spinning rather than flashing the form again.
  const pending = busy || status === "authenticated";
  const canSubmit = otpSent ? otp.trim().length === 6 : validNumber;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
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
          <h1 className="text-lg font-bold tracking-tight">Vendor sign in</h1>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Enter your mobile number to sign in or list your restaurant.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <span className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  +91
                </span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(event) => changeNumber(event.target.value)}
                  placeholder="98765 43210"
                  className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-[4.25rem] text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                />
              </div>
            </div>

            {otpSent && (
              <div className="space-y-1.5">
                <Label htmlFor="otp">6-digit code</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm tracking-[0.3em] outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={askForCode}
                  disabled={resendIn > 0 || busy}
                  className="text-[0.8125rem] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  {resendIn > 0 ? `Send it again in ${resendIn}s` : "Send it again"}
                </button>
              </div>
            )}

            {notice && !error && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[0.8125rem] text-muted-foreground">
                {notice}
              </p>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending || !canSubmit}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {otpSent ? "Verify and continue" : "Send code"}
            </Button>
          </form>

          <p className="mt-4 text-center text-[0.8125rem] text-muted-foreground">
            New here? Enter your number — we&apos;ll take you through listing your
            restaurant once it&apos;s verified.
          </p>
        </div>

        <p className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
          API: {API_BASE_URL}
        </p>
      </div>
    </div>
  );
}
