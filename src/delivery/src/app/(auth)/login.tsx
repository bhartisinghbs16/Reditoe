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
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/registration";
import { LOGO_RATIO, RiderHero } from "@/components/brand";

/**
 * Login, reproduced from the reference: the lockup and "Need Help?" across the
 * top, the greeting and the three selling points beside the courier, then the
 * sheet carrying the number and the code.
 *
 * There is one way in: a mobile number and the code texted to it. No password -
 * a rider on the road loses one more often than they lose their phone.
 *
 * It is also the way to sign up. Once the number is verified the server says
 * whether anybody has it: a partner is signed in, and a number nobody has is
 * taken on to the sign-up page, which collects the rest. So this screen never
 * asks "are you new?", and cannot be used to find out who is.
 */

/** Ten digits starting 6-9 — the ranges Indian mobile numbers actually use. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const tenDigits = (value: string) => value.replace(/\D/g, "").slice(-10);

/** How long to wait for another code when the server does not say. */
const DEFAULT_RESEND_SECONDS = 30;

const mmss = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export default function Login() {
  const router = useRouter();
  const { requestOtp, verifyOtp } = useSession();

  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  /**
   * Seconds until the code can be asked for again.
   *
   * Without it "Resend" is tappable the instant the first code goes out, which
   * mostly produces two codes and a rider wondering which one works. The server
   * enforces the same wait; this only stops them tapping into a refusal.
   */
  const [resendIn, setResendIn] = React.useState(0);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await verifyOtp(tenDigits(phone), otp.trim());

      if (!result.isNewUser) {
        router.replace("/(tabs)");
        return;
      }

      /*
       * Nobody has this number yet: on to the sign-up page.
       *
       * The proof goes into the application draft, which is what the rest of
       * sign-up reads. A draft this rider already started on the same number is
       * kept - coming back to log in must not cost them the steps they filled in.
       */
      const earlier = await loadDraft();
      const sameNumber = earlier && tenDigits(earlier.phone) === tenDigits(result.phone);
      await saveDraft({
        ...(sameNumber ? earlier : EMPTY_DRAFT),
        phone: tenDigits(result.phone),
        phoneProof: result.phoneProof,
      });
      router.replace("/(auth)/signup");
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
        */}
        <View className="mt-4 rounded-t-[22px] bg-surface px-4 pb-6 pt-5">
          <Txt weight="bold">Login with OTP</Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            We&apos;ll text you an OTP to verify your number
          </Txt>

          <View className="mt-3">
            <Field
              placeholder="Enter Mobile Number"
              value={phone}
              onChangeText={changeNumber}
              prefix="+91"
              trailing="call-outline"
              keyboardType="phone-pad"
            />
          </View>

          {otpSent && (
            <View className="mt-4">
              <Txt weight="bold">Enter OTP</Txt>
              <View className="mt-2">
                <OtpInput value={otp} onChangeText={(next) => setOtp(next.replace(/\D/g, ""))} />
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

          {notice && (
            <View className="mt-3">
              <NoteBar tone="blue" icon="chatbubble-ellipses-outline" detail={notice} />
            </View>
          )}

          {error && (
            <View className="mt-3">
              <NoteBar tone="red" icon="alert-circle" detail={error} />
            </View>
          )}

          <Button
            label={otpSent ? "Verify & Continue" : "Send OTP"}
            accent="brand"
            size="lg"
            className="mt-4"
            loading={busy}
            disabled={otpSent ? otp.trim().length !== 6 : !validNumber}
            onPress={otpSent ? submitCode : askForCode}
          />

          {/*
            Where a new partner starts. There is no separate sign-up door: the
            same number and code that sign a partner in also begin an
            application, and the server decides which once the number is proved.
          */}
          <View className="mt-5 flex-row items-center gap-3 rounded-card border border-bad-soft bg-bad-soft px-3 py-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-surface">
              <Ionicons name="bicycle" size={20} color={colors.bad.default} />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">New to Reditoe Partner?</Txt>
              <Txt size="tiny" tone="muted">
                Enter your mobile number above. Once it&apos;s verified, we&apos;ll take
                you through sign-up.
              </Txt>
            </View>
          </View>
        </View>

        {/*
          The three selling points are chips beside the heading now, where the
          reference puts them.
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
