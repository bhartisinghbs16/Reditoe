"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

/**
 * Password reset, in the three steps the API models it as: ask for a code,
 * prove you received it, then set the new password.
 *
 * The console previously answered "Forgot password?" with a toast telling the
 * operator to find a super admin, even though the endpoints for self-service
 * reset have always existed.
 */

type Step = "email" | "otp" | "password";

/** Matches the API's own minimum, so a rejection cannot come as a surprise. */
const MIN_PASSWORD = 8;

interface ForgotResponse {
  message?: string;
  /**
   * Present only when the server has no email provider configured — it returns
   * the code rather than pretending to have sent it. Never present in
   * production.
   */
  devOtp?: string;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function run<T>(work: () => Promise<T>, onDone: (result: T) => void) {
    setError(null);
    setBusy(true);
    try {
      onDone(await work());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const requestCode = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        api.post<ForgotResponse>(
          /**
         * The admin route, not the customer one. It checks the address
         * belongs to an admin account and says so when it does not, rather
         * than answering the same way either way - which left an owner
         * unable to tell a typo from a broken server.
         */
        "/admin/auth/forgot-password-otp",
          { email: email.trim() },
          { anonymous: true }
        ),
      (result) => {
        // When email is not configured the server hands back the code instead
        // of silently failing. Filling it in is more honest than asking the
        // operator to read it out of a server log.
        if (result?.devOtp) {
          setOtp(result.devOtp);
          setNotice(
            "This server has no email provider configured, so the code is filled in for you."
          );
        } else {
          setNotice(`A six-digit code has been sent to ${email.trim()}.`);
        }
        setStep("otp");
      }
    );
  };

  const verifyCode = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        api.post(
          "/auth/verify-forgot-otp",
          { email: email.trim(), otp: otp.trim() },
          { anonymous: true }
        ),
      () => {
        setNotice(null);
        setStep("password");
      }
    );
  };

  const setNewPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    void run(
      () =>
        api.post(
          "/auth/reset-password",
          {
            email: email.trim(),
            otp: otp.trim(),
            // Sent under both names: the API has accepted either historically,
            // and guessing wrong here fails at the last step of the flow.
            newPassword: password,
            password,
          },
          { anonymous: true }
        ),
      () => {
        setNotice("Password changed. Redirecting you to sign in…");
        setTimeout(() => router.replace("/login"), 1200);
      }
    );
  };

  const heading =
    step === "email"
      ? "Reset your password"
      : step === "otp"
        ? "Enter the code"
        : "Choose a new password";

  const blurb =
    step === "email"
      ? "We will send a six-digit code to the email on your admin account."
      : step === "otp"
        ? "The code expires shortly after it is issued."
        : "Pick something you have not used here before.";

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
        </div>

        <div className="surface p-6">
          <h1 className="text-lg font-bold tracking-tight">{heading}</h1>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">{blurb}</p>

          {step === "email" && (
            <form onSubmit={requestCode} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@reditoe.com"
                    className="pl-9"
                  />
                </div>
              </div>
              <Feedback error={error} notice={notice} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Send the code
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyCode} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp">Six-digit code</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="pl-9 tracking-[0.3em]"
                  />
                </div>
              </div>
              <Feedback error={error} notice={notice} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify
              </Button>
              <button
                type="button"
                className="w-full text-center text-[0.8125rem] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setNotice(null);
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={setNewPassword} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={`At least ${MIN_PASSWORD} characters`}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Repeat it"
                    className="pl-9"
                  />
                </div>
              </div>
              <Feedback error={error} notice={notice} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Change password
              </Button>
            </form>
          )}
        </div>

        <Link
          href="/login"
          className="mt-4 flex items-center justify-center gap-1.5 text-[0.8125rem] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[0.8125rem] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        {notice}
      </p>
    );
  }
  return null;
}
