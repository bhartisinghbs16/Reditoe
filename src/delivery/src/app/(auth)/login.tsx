import React from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActionLink,
  Button,
  Field,
  NoteBar,
  OtpInput,
  Txt,
  colors,
} from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { LOGO_RATIO, RiderHero } from "@/components/brand";

/**
 * Login, reproduced from the reference: the lockup and "Need Help?" across the
 * top, the greeting and the three selling points beside the courier, then the
 * sheet carrying the two fields, the red primary, and OTP as the alternative.
 *
 * One greeting and one way of choosing a method. It used to open with a
 * Password/OTP tab pair and repeat "Welcome partner!" under the "Welcome /
 * Delivery Partner!" heading, so both the greeting and the choice of method
 * appeared twice.
 */

export default function Login() {
  const router = useRouter();
  const { signIn, requestOtp, signInWithOtp } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Two ways in, because a rider on the road loses a password more often than
   * they lose their phone.
   *
   * The code goes to whichever the account was registered with - an email
   * address is emailed, a mobile number is texted - so one box takes either
   * and the server decides how to reach them.
   */
  const [mode, setMode] = React.useState<"password" | "otp">("password");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  /**
   * Seconds until the code can be asked for again.
   *
   * The reference counts down from thirty. Without it "Send it again" is
   * tappable the instant the first code goes out, which mostly produces two
   * codes and a rider wondering which one works.
   */
  const [resendIn, setResendIn] = React.useState(0);
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const mmss = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

  // Switching tabs abandons whatever the other one was in the middle of.
  const switchTo = (next: "password" | "otp") => {
    setMode(next);
    setError(null);
    setNotice(null);
    setOtp("");
    setOtpSent(false);
    setResendIn(0);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  };

  const askForCode = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setOtpSent(true);
      setResendIn(30);
      setNotice(
        email.includes("@")
          ? "We've emailed you a 6-digit code."
          : "We've texted you a 6-digit code."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * The second way in, from the identifier already on screen.
   *
   * The reference offers "Send OTP" under the password form rather than a
   * tab, so a rider who has typed their number should not have to type it
   * again; if the box is empty they land on the OTP form to fill it in.
   */
  const switchToOtp = () => {
    switchTo("otp");
    if (email.trim()) void askForCode();
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithOtp(email.trim(), otp.trim());
      router.replace("/(tabs)");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4 pt-3">
          {/* The lockup, and the way out when something is wrong — both at
              the top, where the reference puts them. */}
          <View className="flex-row items-start justify-between gap-3">
            <Image
              source={require("../../../assets/images/logo-header.png")}
              style={{ width: 178, height: 178 / LOGO_RATIO }}
              resizeMode="contain"
              accessibilityLabel="Reditoe Delivery Partner"
            />
            <Pressable
              onPress={() => router.push("/support")}
              hitSlop={8}
              className="mt-1 flex-row items-center gap-1.5 active:opacity-70"
            >
              <Ionicons name="headset" size={15} color={colors.bad.default} />
              <Txt size="tiny" weight="bold" tone="bad">
                Need Help?
              </Txt>
            </Pressable>
          </View>

          {/* The greeting and the courier side by side, as the reference
              draws them. */}
          <View className="mt-2 flex-row items-center gap-2">
            <View className="min-w-0 flex-[1.15]">
              <Txt size="2xl" weight="bold" className="leading-tight">
                Welcome
              </Txt>
              <Txt size="2xl" weight="bold" tone="bad" className="leading-tight">
                Delivery Partner!
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-1.5">
                Login to your account and start delivering happiness
              </Txt>

              <View className="mt-3 flex-row gap-2">
                {(
                  [
                    ["time-outline", "Flexible", "Timings"],
                    ["shield-checkmark-outline", "Safe &", "Secure"],
                    ["wallet-outline", "Weekly", "Payments"],
                  ] as const
                ).map(([icon, top, bottom]) => (
                  <View key={top} className="flex-1 items-center">
                    <Ionicons name={icon} size={18} color={colors.bad.default} />
                    <Txt size="micro" weight="bold" className="mt-1 text-center">
                      {top}
                    </Txt>
                    <Txt size="micro" weight="bold" className="text-center">
                      {bottom}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>

            <RiderHero height={172} className="flex-1" />
          </View>
        </View>

        {/*
          The sheet carries the form and nothing else.

          It opened with "Welcome partner!" over "Sign in to your delivery
          partner account", directly beneath the "Welcome / Delivery Partner!"
          heading above — the same greeting twice on one screen, which is what
          the client saw.
        */}
        <View className="mt-4 rounded-t-[22px] bg-surface px-4 pb-6 pt-5">
          {mode === "otp" ? (
            <View className="mt-4">
              <Txt weight="bold">Login with OTP</Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                We&apos;ll send you an OTP to verify your number
              </Txt>

              {/*
                A mobile number with the country code beside it, as the
                reference draws it. The field still accepts an email address -
                accounts were registered with either, and the server decides
                whether to text or email the code - but a rider standing in
                the street is typing a phone number.
              */}
              <View className="mt-3">
                <Field
                  placeholder="Enter Mobile Number"
                  value={email}
                  onChangeText={setEmail}
                  prefix="+91"
                  trailing="call-outline"
                  keyboardType="default"
                />
              </View>

              {otpSent && (
                <View className="mt-4">
                  <Txt weight="bold">Enter OTP</Txt>
                  <View className="mt-2">
                    <OtpInput value={otp} onChangeText={setOtp} />
                  </View>
                  <View className="mt-2 items-end">
                    {resendIn > 0 ? (
                      <Txt size="tiny" tone="muted">
                        Resend OTP in{" "}
                        <Txt size="tiny" weight="bold" tone="bad">
                          {mmss(resendIn)}
                        </Txt>
                      </Txt>
                    ) : (
                      <ActionLink
                        label="Resend OTP"
                        accent="brand"
                        icon="none"
                        onPress={askForCode}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View className="gap-3">
              {/* One box for either, because an account is registered with
                  either and the rider does not know which we hold. */}
              <Field
                placeholder="Email ID or Mobile Number"
                value={email}
                onChangeText={setEmail}
                icon="mail"
                keyboardType="default"
              />
              <Field
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                icon="lock-closed"
                secure={!reveal}
                trailing={reveal ? "eye-outline" : "eye-off-outline"}
                onTrailing={() => setReveal((on) => !on)}
              />
            </View>
          )}

          {notice && (
            <View className="mt-3">
              <NoteBar tone="blue" icon="mail-open-outline" detail={notice} />
            </View>
          )}

          {error && (
            <View className="mt-3">
              <NoteBar tone="red" icon="alert-circle" detail={error} />
            </View>
          )}

          {mode === "password" && (
            <View className="mt-2.5 items-end">
              {/* Was a label with nothing behind it. */}
              <ActionLink
                label="Forgot Password?"
                accent="brand"
                icon="none"
                onPress={() => router.push("/(auth)/forgot-password")}
              />
            </View>
          )}

          <Button
            label={
              mode === "otp" ? (otpSent ? "Verify & Continue" : "Send OTP") : "Login"
            }
            accent="brand"
            size="lg"
            className="mt-4"
            loading={busy}
            disabled={
              mode === "otp"
                ? !email.trim() || (otpSent && otp.trim().length < 4)
                : !email.trim() || !password
            }
            onPress={mode === "otp" ? (otpSent ? submitCode : askForCode) : submit}
          />

          {/*
            The other way in, as the reference offers it: an OR rule and a
            plain outlined button, rather than making the rider find the tab.
          */}
          {/*
            The other way in, offered rather than hidden behind a tab.
            The screen carried both a Password/OTP tab pair at the top and
            this button at the bottom, so either method was on screen twice.
          */}
          {mode === "password" ? (
            <View className="mt-5">
              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-line" />
                <Txt size="tiny" tone="muted" weight="semibold">
                  OR
                </Txt>
                <View className="h-px flex-1 bg-line" />
              </View>
              <Pressable
                onPress={switchToOtp}
                className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-card border border-bad bg-surface active:opacity-70"
              >
                <Ionicons name="chatbubble-ellipses" size={17} color={colors.bad.default} />
                <Txt weight="bold" tone="bad">
                  Send OTP
                </Txt>
                <Ionicons name="arrow-forward" size={16} color={colors.bad.default} />
              </Pressable>
            </View>
          ) : (
            <View className="mt-4 items-center">
              <ActionLink
                label="Login with password instead"
                accent="brand"
                icon="none"
                onPress={() => switchTo("password")}
              />
            </View>
          )}

          {/*
            A "Continue with Google" button used to sit here and open the
            ordinary signup form. Somebody tapping it expects their Google
            account to sign them in, and got a blank form instead - a button
            that lies about what it does is worse than no button. Google
            sign-in needs a client id nobody has configured; when there is
            one, it belongs here.
          */}
          <Pressable
            onPress={() => router.push("/register")}
            className="mt-5 flex-row items-center gap-3 rounded-card border border-bad-soft bg-bad-soft px-3 py-3 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surface">
              <Ionicons name="bicycle" size={20} color={colors.bad.default} />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">New to Reditoe Partner?</Txt>
              <Txt size="tiny" tone="muted">
                Join us and start earning with Reditoe
              </Txt>
            </View>
            <View className="flex-row items-center gap-1 rounded-pill bg-bad px-3 py-1.5">
              <Txt size="micro" weight="bold" tone="white">
                Sign Up
              </Txt>
              <Ionicons name="arrow-forward" size={12} color="#ffffff" />
            </View>
          </Pressable>
        </View>

        {/*
          The three selling points are chips beside the heading now, where the
          reference puts them. They were a strip down here as well, and two of
          its three read "Secure & Reliable" and "Safe & Secure".
        */}
        <View className="bg-surface pb-8 pt-2">
          <View className="flex-row items-center justify-center gap-2 px-4">
            <View className="h-px w-8 bg-line" />
            <Txt size="tiny" tone="muted" weight="semibold">
              Together We Deliver Happiness
            </Txt>
            <View className="h-px w-8 bg-line" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
