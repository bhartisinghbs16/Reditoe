"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { request, ApiError } from "@/lib/api";

/**
 * Vendor password reset.
 *
 * Three steps, because that is how the API models it: ask for a code, prove it
 * arrived, then set the new password. The identifier can be an email address
 * or a mobile number and the server decides which — a vendor who registered by
 * phone was previously unable to reset at all.
 *
 * The resend cooldown is the server's; this counts it down rather than
 * inventing its own, so the button never offers something that will be refused.
 */

type Step = "identify" | "otp" | "password";

/** Matches the API's own rule, so a rejection cannot come as a surprise. */
function passwordProblem(value: string) {
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Include at least one letter.";
  if (!/\d/.test(value)) return "Include at least one number.";
  return null;
}

interface CodeResponse {
  message?: string;
  channel?: string;
  resendAfterSeconds?: number;
  /**
   * Present only when the server has no way to send — it hands the code back
   * rather than pretending. Never in production.
   */
  devOtp?: string;
}

export default function VendorForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("identify");
  const [identifier, setIdentifier] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function run<T>(work: () => Promise<T>, then: (result: T) => void) {
    setBusy(true);
    setError(null);
    try {
      then(await work());
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const sendCode = (event?: React.FormEvent) => {
    event?.preventDefault();
    void run(
      () =>
        request<CodeResponse>("/auth/forgot-password", {
          method: "POST",
          body: { emailOrPhone: identifier.trim() },
          anonymous: true,
        }),
      (result) => {
        setResendIn(result?.resendAfterSeconds ?? 60);
        if (result?.devOtp) {
          setOtp(result.devOtp);
          setNotice(
            "This server cannot send messages, so the code is filled in for you."
          );
        } else {
          setNotice(
            result?.channel === "phone"
              ? "We sent a code to your mobile number."
              : "We sent a code to your email."
          );
        }
        setStep("otp");
      }
    );
  };

  const verifyCode = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        request("/auth/verify-forgot-otp", {
          method: "POST",
          body: { emailOrPhone: identifier.trim(), otp: otp.trim() },
          anonymous: true,
        }),
      () => {
        setNotice(null);
        setStep("password");
      }
    );
  };

  const savePassword = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords do not match.");

    void run(
      () =>
        request("/auth/reset-password", {
          method: "POST",
          body: {
            emailOrPhone: identifier.trim(),
            otp: otp.trim(),
            newPassword: password,
            confirmPassword: confirm,
          },
          anonymous: true,
        }),
      () => {
        setNotice("Password changed. Taking you to sign in…");
        setTimeout(() => router.replace("/login"), 1200);
      }
    );
  };

  const heading =
    step === "identify"
      ? "Reset your password"
      : step === "otp"
        ? "Enter the code"
        : "Choose a new password";

  const sub =
    step === "identify"
      ? "Enter the email address or mobile number your account uses."
      : step === "otp"
        ? `We sent a six-digit code to ${identifier.trim()}.`
        : "At least 8 characters, with a letter and a number.";

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-2xl font-extrabold tracking-tight text-primary">
          Reditoe
        </div>

        <div className="surface p-6">
          <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>

          {notice && !error && (
            <Alert className="mt-4">
              <CheckCircle2 className="size-4" />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "identify" && (
            <form onSubmit={sendCode} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Email or mobile number</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="you@restaurant.com or 9123456789"
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={busy || !identifier.trim()} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Send code
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyCode} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp">Six-digit code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="h-10 tracking-[0.4em]"
                />
              </div>
              <Button type="submit" disabled={busy || otp.length < 4} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify code
              </Button>
              {/* The cooldown is the server's; asking sooner is refused. */}
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={resendIn > 0 || busy}
                onClick={() => sendCode()}
              >
                <RefreshCw className="size-4" />
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </Button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={savePassword} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Update password
              </Button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
