import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { TextField } from "@/components/form";
import { Button, Card, Txt, colors } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Vendor password reset.
 *
 * Three steps, because that is how the API models it: ask for a code, prove it
 * arrived, then set the new password. The app had no way in at all — a vendor
 * who forgot their password had to be reset by hand.
 *
 * The identifier is an email address or a mobile number and the server decides
 * which, so a vendor who registered by phone is not shut out.
 */

type Step = "identify" | "otp" | "password";

/** Matches the API's rule, so a rejection cannot come as a surprise. */
function passwordProblem(value: string) {
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Include at least one letter.";
  if (!/\d/.test(value)) return "Include at least one number.";
  return null;
}

export default function VendorForgotPassword() {
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

  const call = async <T,>(work: () => Promise<T>, then: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      then(await work());
    } catch (reason: any) {
      setError(reason?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    call(
      () =>
        api.post<{ devOtp?: string; channel?: string; resendAfterSeconds?: number }>(
          "/auth/forgot-password",
          { emailOrPhone: identifier.trim() },
          false
        ),
      (result) => {
        setResendIn(result?.resendAfterSeconds ?? 60);
        if (result?.devOtp) {
          setOtp(result.devOtp);
          setNotice("This server cannot send messages, so the code is filled in for you.");
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

  const verifyCode = () =>
    call(
      () =>
        api.post(
          "/auth/verify-forgot-otp",
          { emailOrPhone: identifier.trim(), otp: otp.trim() },
          false
        ),
      () => {
        setNotice(null);
        setStep("password");
      }
    );

  const savePassword = () => {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords do not match.");

    return call(
      () =>
        api.post(
          "/auth/reset-password",
          {
            emailOrPhone: identifier.trim(),
            otp: otp.trim(),
            newPassword: password,
            confirmPassword: confirm,
          },
          false
        ),
      () => {
        setNotice("Password changed. Sign in with it now.");
        setTimeout(() => router.replace("/login"), 1000);
      }
    );
  };

  const heading =
    step === "identify"
      ? "Reset your password"
      : step === "otp"
        ? "Enter the code"
        : "Choose a new password";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView contentContainerClassName="p-4 pb-10">
        <Pressable
          onPress={() => router.back()}
          className="mb-3 flex-row items-center gap-1.5 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink.muted} />
          <Txt size="sm" tone="muted">
            Back to sign in
          </Txt>
        </Pressable>

        <Card className="p-4">
          <Txt size="xl" weight="bold">
            {heading}
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-1">
            {step === "identify"
              ? "Enter the email address or mobile number your account uses."
              : step === "otp"
                ? `We sent a six-digit code to ${identifier.trim()}.`
                : "At least 8 characters, with a letter and a number."}
          </Txt>

          {notice && !error && (
            <Txt size="tiny" tone="ok" className="mt-3">
              {notice}
            </Txt>
          )}
          {error && (
            <Txt size="tiny" tone="bad" className="mt-3">
              {error}
            </Txt>
          )}

          {step === "identify" && (
            <>
              <TextField
                label="Email or mobile number"
                placeholder="you@restaurant.com or 9123456789"
                value={identifier}
                onChangeText={setIdentifier}
                className="mt-3"
              />
              <Button
                label={busy ? "Sending…" : "Send code"}
                loading={busy}
                disabled={identifier.trim().length < 6}
                onPress={() => void sendCode()}
                className="mt-4"
              />
            </>
          )}

          {step === "otp" && (
            <>
              <TextField
                label="Six-digit code"
                placeholder="123456"
                keyboardType="numeric"
                maxLength={6}
                value={otp}
                onChangeText={(next) => setOtp(next.replace(/[^0-9]/g, ""))}
                className="mt-3"
              />
              <Button
                label={busy ? "Checking…" : "Verify code"}
                loading={busy}
                disabled={otp.length < 4}
                onPress={() => void verifyCode()}
                className="mt-4"
              />
              {/* The cooldown belongs to the server; asking sooner is refused. */}
              <Pressable
                disabled={resendIn > 0 || busy}
                onPress={() => void sendCode()}
                className="mt-3 items-center py-2 active:opacity-70"
              >
                <Txt size="tiny" weight="bold" tone={resendIn > 0 ? "faint" : "brand"}>
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </Txt>
              </Pressable>
            </>
          )}

          {step === "password" && (
            <>
              <TextField
                label="New password"
                placeholder="At least 8 characters"
                secure
                value={password}
                onChangeText={setPassword}
                className="mt-3"
              />
              <TextField
                label="Confirm new password"
                placeholder="Type it again"
                secure
                value={confirm}
                onChangeText={setConfirm}
                className="mt-3"
              />
              <Button
                label={busy ? "Saving…" : "Update password"}
                loading={busy}
                onPress={() => void savePassword()}
                className="mt-4"
              />
            </>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
