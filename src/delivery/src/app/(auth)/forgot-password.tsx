import React from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, NoteBar, Txt, colors } from "@/components/ui";
import { request } from "@/lib/api";

/**
 * Rider password reset.
 *
 * The Sign In screen offered "Forgot Password?" as a link that did nothing.
 * This is the flow behind it: ask for a code, prove it arrived, choose a new
 * password.
 *
 * The identifier is an email address or a mobile number and the server works
 * out which — a rider created by an admin has both, and a rider is far more
 * likely to remember the number they ride with.
 */

type Step = "identify" | "otp" | "password";

/** Matches the API's rule, so a rejection cannot come as a surprise. */
function passwordProblem(value: string) {
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Include at least one letter.";
  if (!/\d/.test(value)) return "Include at least one number.";
  return null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: "default" | "number-pad" | "email-address";
  maxLength?: number;
}) {
  return (
    <View className="mt-3.5">
      <Txt size="tiny" tone="muted" className="mb-1.5">
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink.faint}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        className="h-12 rounded-tile border border-line bg-surface px-3.5 text-[15px] text-ink"
      />
    </View>
  );
}

export default function RiderForgotPassword() {
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
        request<{ devOtp?: string; channel?: string; resendAfterSeconds?: number }>(
          "/auth/forgot-password",
          { method: "POST", body: { emailOrPhone: identifier.trim() }, anonymous: true }
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

  const savePassword = () => {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords do not match.");

    return call(
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
        setNotice("Password changed. Sign in with it now.");
        setTimeout(() => router.replace("/(auth)/login"), 1000);
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

        <Txt size="2xl" weight="bold">
          {heading}
        </Txt>
        <Txt size="sm" tone="muted" className="mt-1">
          {step === "identify"
            ? "Enter the email address or mobile number your account uses."
            : step === "otp"
              ? `We sent a six-digit code to ${identifier.trim()}.`
              : "At least 8 characters, with a letter and a number."}
        </Txt>

        {notice && !error && (
          <View className="mt-3">
            <NoteBar tone="green" icon="checkmark-circle" detail={notice} />
          </View>
        )}
        {error && (
          <View className="mt-3">
            <NoteBar tone="red" icon="alert-circle" detail={error} />
          </View>
        )}

        {step === "identify" && (
          <>
            <Field
              label="Email or mobile number"
              value={identifier}
              onChange={setIdentifier}
              placeholder="you@example.com or 9123456789"
            />
            <Button
              label={busy ? "Sending…" : "Send code"}
              accent="brand"
              size="lg"
              className="mt-5"
              disabled={busy || identifier.trim().length < 6}
              onPress={() => void sendCode()}
            />
          </>
        )}

        {step === "otp" && (
          <>
            <Field
              label="Six-digit code"
              value={otp}
              onChange={(next) => setOtp(next.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button
              label={busy ? "Checking…" : "Verify code"}
              accent="brand"
              size="lg"
              className="mt-5"
              disabled={busy || otp.length < 4}
              onPress={() => void verifyCode()}
            />
            {/* The cooldown belongs to the server; asking sooner is refused. */}
            <Pressable
              disabled={resendIn > 0 || busy}
              onPress={() => void sendCode()}
              className="mt-3 items-center py-2 active:opacity-70"
            >
              <Txt size="sm" weight="bold" tone={resendIn > 0 ? "faint" : "brand"}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </Txt>
            </Pressable>
          </>
        )}

        {step === "password" && (
          <>
            <Field
              label="New password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              secure
            />
            <Field
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Type it again"
              secure
            />
            <Button
              label={busy ? "Saving…" : "Update password"}
              accent="brand"
              size="lg"
              className="mt-5"
              disabled={busy}
              onPress={() => void savePassword()}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
