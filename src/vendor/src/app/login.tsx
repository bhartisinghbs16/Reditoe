import React from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { TextField } from "@/components/form";
import { Button, Card, Txt, colors } from "@/components/ui";
import { LOGO_RATIO } from "@/components/brand";
import { useStore } from "@/lib/store";

/**
 * Vendor sign-in, and the way into sign-up.
 *
 * The only screen reachable without a session. There is one way in: a mobile
 * number and the code texted to it - no password, because a kitchen phone is
 * shared and passwords get lost.
 *
 * It is also where a new restaurant starts. Once the number is verified the
 * server says whether anybody has it: a vendor is signed in, and a number
 * nobody has is taken on to the sign-up wizard, which collects the rest. So the
 * screen never asks "are you new?", and cannot be used to find out who is.
 */

/** Ten digits starting 6-9 — the ranges Indian mobile numbers actually use. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const tenDigits = (value: string) => value.replace(/\D/g, "").slice(-10);

/** How long to wait for another code when the server does not say. */
const DEFAULT_RESEND_SECONDS = 30;

export default function Login() {
  const router = useRouter();
  const { requestOtp, verifyOtp, cancelSignUp } = useStore();

  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** Seconds until another code can be asked for; the server sets the cooldown. */
  const [resendIn, setResendIn] = React.useState(0);

  // Arriving here starts a sign-in afresh. A number half way through signing up
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
    if (!validNumber) {
      setError("Enter a 10-digit mobile number starting with 6, 7, 8 or 9.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
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
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await verifyOtp(tenDigits(phone), otp.trim());
      // A vendor with an account is signed in, and the session gate takes them
      // into the app. A number nobody has goes on to sign up.
      if (outcome === "new") router.replace("/signup");
    } catch (reason: any) {
      setError(reason?.message ?? "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-surface-sunken">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-5 py-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/*
            One screen, and the sign-in on it. The wide lockup, at its own
            shape: logo.png is the 1254x1254 app icon on an opaque square, which
            "contain" turned into a small badge with a black edge.
          */}
          <View className="items-center">
            <Image
              source={require("../../assets/images/logo-header.png")}
              style={{ width: 200, height: 200 / LOGO_RATIO }}
              resizeMode="contain"
              accessibilityLabel="Reditoe Vendor Partner"
            />
          </View>

          <Card className="mt-4 rounded-t-[26px] p-5">
            <Txt size="lg" weight="bold">
              Welcome, vendor! 🏪
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Enter your mobile number to sign in or register your restaurant.
            </Txt>

            <TextField
              label="Mobile number"
              required
              placeholder="98765 43210"
              icon="call-outline"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={changeNumber}
              className="mt-4"
            />

            {otpSent && (
              <View className="mt-3">
                <TextField
                  label="6-digit code"
                  required
                  placeholder="000000"
                  icon="keypad-outline"
                  keyboardType="numeric"
                  maxLength={6}
                  value={otp}
                  onChangeText={(next) => setOtp(next.replace(/\D/g, "").slice(0, 6))}
                />
                <Pressable
                  onPress={askForCode}
                  disabled={resendIn > 0 || busy}
                  hitSlop={8}
                  className="mt-2 self-start"
                >
                  <Txt size="tiny" weight="bold" tone={resendIn > 0 ? "faint" : "brand"}>
                    {resendIn > 0 ? `Send it again in ${resendIn}s` : "Send it again"}
                  </Txt>
                </Pressable>
              </View>
            )}

            {notice && !error && (
              <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-brand-50 px-3 py-2.5">
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.brand[600]} />
                <Txt size="tiny" className="flex-1">
                  {notice}
                </Txt>
              </View>
            )}

            {error && (
              <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-bad-soft px-3 py-2.5">
                <Ionicons name="alert-circle" size={15} color={colors.bad.default} />
                <Txt size="tiny" className="flex-1 text-bad-ink">
                  {error}
                </Txt>
              </View>
            )}

            <Button
              label={
                busy
                  ? otpSent
                    ? "Checking…"
                    : "Sending…"
                  : otpSent
                    ? "Verify & continue"
                    : "Send code"
              }
              iconRight={busy ? undefined : "chevron-forward"}
              loading={busy}
              disabled={otpSent ? otp.trim().length !== 6 : !validNumber}
              onPress={otpSent ? submitCode : askForCode}
              className="mt-4"
            />

            <Txt size="micro" tone="muted" className="mt-3 text-center">
              New to Reditoe? Enter your number — we&apos;ll take you through registering
              your restaurant once it&apos;s verified.
            </Txt>
          </Card>

          {/* What the platform is offering, in four words each. */}
          <View className="mt-4 flex-row">
            {[
              { icon: "restaurant" as const, title: "More customers", detail: "Get noticed by food lovers" },
              { icon: "trending-up" as const, title: "More sales", detail: "Grow your business" },
              { icon: "settings" as const, title: "Easy management", detail: "Menu, orders and offers" },
              { icon: "shield-checkmark" as const, title: "Our support", detail: "We are always with you" },
            ].map((item, index) => (
              <View
                key={item.title}
                className={`flex-1 items-center gap-1 px-1 ${
                  index > 0 ? "border-l border-line" : ""
                }`}
              >
                <Ionicons name={item.icon} size={15} color={colors.brand[600]} />
                <Txt size="micro" weight="bold" className="text-center">
                  {item.title}
                </Txt>
                <Txt size="micro" tone="faint" className="text-center">
                  {item.detail}
                </Txt>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
