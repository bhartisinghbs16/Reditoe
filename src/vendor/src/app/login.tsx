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
 * Vendor sign-in.
 *
 * The only screen reachable without a session. It is deliberately plain: the
 * job is to get a working kitchen back into the app quickly, so the form is
 * two fields and the errors say what to do next.
 */
export default function Login() {
  const router = useRouter();
  const { signIn, requestOtp, signInWithOtp } = useStore();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Two ways in, because a kitchen phone is shared and passwords get lost.
   *
   * The code goes to whichever the account was registered with - an email
   * address is emailed, a mobile number is texted - so the same box takes
   * either and the server decides how to reach them.
   */
  const [mode, setMode] = React.useState<"password" | "otp">("password");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Switching tabs abandons whatever the other one was in the middle of.
  const switchTo = (next: "password" | "otp") => {
    setMode(next);
    setError(null);
    setNotice(null);
    setOtp("");
    setOtpSent(false);
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't sign you in.");
    } finally {
      setBusy(false);
    }
  };

  const askForCode = async () => {
    if (!email.trim()) {
      setError("Enter your email or mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestOtp(email.trim());
      setOtpSent(true);
      setNotice(
        email.includes("@")
          ? "We've emailed you a 6-digit code."
          : "We've texted you a 6-digit code."
      );
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (otp.trim().length < 4) {
      setError("Enter the code we sent you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithOtp(email.trim(), otp.trim());
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
            The screen a restaurant owner meets before they have decided to
            join. It led with a wordmark and a form; it now says what the
            platform is offering them, which is the job of this page.
          */}
          {/*
            One screen, and the sign-in on it.

            This opened with the wordmark, a two-line headline, a rule and
            three "More orders / More customers / Bigger growth" rows before
            the form began, so on an ordinary phone the password field and the
            sign-in button were below the fold - a vendor had to scroll to sign
            in. The marketing is gone; a vendor opening this app already knows
            what it is for.
          */}
          {/*
            The wide lockup, at its own shape.

            This drew logo.png - the 1254x1254 app icon, on its own opaque
            square - into a 168x66 slot. "contain" keeps the aspect, so it
            came out as a 66px square badge with a black edge sitting in a
            168-wide gap, which is what a vendor saw above the sign-in form.
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
              Welcome back, vendor! 🏪
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Sign in to manage your restaurant, menu and orders.
            </Txt>

            <View className="mt-4 flex-row rounded-pill bg-surface-sunken p-1">
              {(
                [
                  ["password", "Password"],
                  ["otp", "One-time code"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => switchTo(key)}
                  className={`flex-1 items-center rounded-pill py-2 ${
                    mode === key ? "bg-surface" : ""
                  }`}
                >
                  <Txt
                    size="tiny"
                    weight={mode === key ? "bold" : "semibold"}
                    tone={mode === key ? "default" : "muted"}
                  >
                    {label}
                  </Txt>
                </Pressable>
              ))}
            </View>

            <TextField
              label={mode === "otp" ? "Email or mobile number" : "Email"}
              required
              placeholder={mode === "otp" ? "you@restaurant.com or 98765 43210" : "you@restaurant.com"}
              icon="mail-outline"
              keyboardType={mode === "otp" ? "default" : "email-address"}
              value={email}
              onChangeText={setEmail}
              className="mt-4"
            />

            {mode === "password" ? (
              <View className="mt-3">
                <TextField
                  label="Password"
                  required
                  placeholder="Your password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  secure
                />
              </View>
            ) : (
              otpSent && (
                <View className="mt-3">
                  <TextField
                    label="6-digit code"
                    required
                    placeholder="000000"
                    icon="keypad-outline"
                    keyboardType="numeric"
                    value={otp}
                    onChangeText={setOtp}
                  />
                  <Pressable onPress={askForCode} hitSlop={8} className="mt-2 self-start">
                    <Txt size="tiny" weight="bold" tone="brand">
                      Send it again
                    </Txt>
                  </Pressable>
                </View>
              )
            )}

            {notice && (
              <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-brand-50 px-3 py-2.5">
                <Ionicons name="mail-open-outline" size={15} color={colors.brand[600]} />
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
                  ? mode === "otp" && !otpSent
                    ? "Sending…"
                    : "Signing in…"
                  : mode === "otp"
                    ? otpSent
                      ? "Verify & sign in"
                      : "Send code"
                    : "Sign in"
              }
              iconRight={busy ? undefined : "chevron-forward"}
              loading={busy}
              onPress={mode === "otp" ? (otpSent ? submitCode : askForCode) : submit}
              className="mt-4"
            />

            <Pressable
              onPress={() => router.push("/forgot-password")}
              className="mt-3 items-center py-1 active:opacity-70"
            >
              <Txt size="tiny" weight="bold" tone="brand">
                Forgot your password?
              </Txt>
            </Pressable>

          </Card>

          {/*
            Registering is the whole point of this screen for anyone who has
            not joined yet, and it was a line of small grey text.
          */}
          <Pressable
            onPress={() => router.push("/signup")}
            className="mt-3 flex-row items-center gap-3 rounded-card border border-brand-100 bg-brand-50 px-3 py-3 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surface">
              <Ionicons name="storefront" size={20} color={colors.brand[600]} />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">New to Reditoe?</Txt>
              <Txt size="tiny" tone="muted">
                Register your restaurant and start receiving orders
              </Txt>
            </View>
            <View className="rounded-pill bg-brand-600 px-3 py-1.5">
              <Txt size="micro" weight="bold" tone="white">
                Sign up
              </Txt>
            </View>
          </Pressable>

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

          {/*
            The sign-in screen no longer hands out a demo account.

            It printed "vendor@reditoe.com / vendor123" as though that were a
            way in. No such account has ever existed, so anyone who followed
            the instruction on the screen was told their password was wrong -
            which is what "the web app is not working" turned out to be.

            The API address went with it. It is a developer's note, and on a
            sign-in page it reads as part of the problem when something fails.
          */}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
