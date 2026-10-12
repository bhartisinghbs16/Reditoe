import React from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { hero } from "@/lib/images";
import { useStore } from "@/lib/store";

/**
 * Sign in, or sign up - the same screen, because it is the same first step.
 *
 * There is no password. A customer types their mobile number, we text them a
 * code, and when it comes back one of two things is true: the number already
 * has an account and they are in, or it does not and they are taken on to
 * finish signing up. Which of those it is gets decided by the server, after the
 * number is proved, so this screen never has to ask "are you new?" and cannot
 * be used to find out who is.
 */

/** Ten digits starting 6-9 — the ranges Indian mobile numbers actually use. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const tenDigits = (value: string) => value.replace(/\D/g, "").slice(-10);
const isMobile = (value: string) => INDIAN_MOBILE.test(tenDigits(value));

/** How long to wait for another code when the server does not say. */
const DEFAULT_RESEND_SECONDS = 30;

function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  maxLength,
  autoFocus,
  oneTimeCode,
  problem,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Shown inside the box before what is typed, e.g. the country code. */
  prefix?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Offers the code the phone has just received, so it need not be retyped. */
  oneTimeCode?: boolean;
  /**
   * What is wrong with what has been typed, shown under the field. Callers
   * pass null until there is something to say, so an empty field is never
   * scolded for being empty.
   */
  problem?: string | null;
}) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View className="mt-3">
      <Txt size="tiny" tone="muted" className="mb-1.5">
        {label}
      </Txt>
      <View
        className={`h-12 flex-row items-center gap-2 rounded-tile border px-3 ${
          problem ? "border-bad" : focused ? "border-brand-500" : "border-line"
        }`}
      >
        {prefix ? (
          <Txt weight="semibold" tone="soft">
            {prefix}
          </Txt>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.ink.faint}
          keyboardType="number-pad"
          textContentType={oneTimeCode ? "oneTimeCode" : "telephoneNumber"}
          autoComplete={oneTimeCode ? "sms-otp" : "tel"}
          autoCorrect={false}
          maxLength={maxLength}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 p-0 text-[15px] text-ink"
        />
      </View>
      {problem && (
        <Txt size="micro" tone="bad" className="mt-1">
          {problem}
        </Txt>
      )}
    </View>
  );
}

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const {
    requestOtp,
    verifyOtp,
    cancelSignUp,
    signOut,
    signedIn,
    signingIn,
    authError,
    authUser,
  } = useStore();

  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** Seconds until another code can be asked for; the server sets the cooldown. */
  const [resendIn, setResendIn] = React.useState(0);

  // Arriving here starts a sign-in afresh. A number half way through signing
  // up on an earlier visit must not be carried into this one.
  React.useEffect(() => {
    cancelSignUp();
  }, [cancelSignUp]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const ready = awaitingCode ? code.trim().length === 6 : isMobile(phone);

  /**
   * Where to go once signed in.
   *
   * This screen is what an unauthenticated visitor is sent to, so there is
   * usually nothing behind it — `router.back()` would leave them staring at the
   * same form. Going back is right only when they opened it themselves from
   * somewhere inside the app.
   */
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  /** Back to the number, discarding a code that was meant for another one. */
  const resetSteps = () => {
    setAwaitingCode(false);
    setCode("");
    setNotice(null);
    setResendIn(0);
  };

  /**
   * Asks for a code. Used for the first one and for "resend": with a code
   * outstanding the main button is the *verify* step, so resending cannot go
   * through it.
   */
  const sendCode = async () => {
    setNotice(null);
    const res = await requestOtp(tenDigits(phone));
    if (!res.ok) return;
    setAwaitingCode(true);
    setResendIn(res.resendAfterSeconds ?? DEFAULT_RESEND_SECONDS);
    // The server hands the code back when it cannot deliver it, so fill it in
    // rather than asking someone to read a server log.
    if (res.code) {
      setCode(res.code);
      setNotice("This server cannot send messages, so the code is filled in for you.");
    } else {
      setCode("");
      setNotice(`We sent a 6-digit code to +91 ${tenDigits(phone)}.`);
    }
  };

  const submit = async () => {
    if (!awaitingCode) {
      await sendCode();
      return;
    }

    const outcome = await verifyOtp(tenDigits(phone), code);
    if (outcome === "signed-in") {
      leave();
    } else if (outcome === "new") {
      // Nobody has this number yet: on to the sign-up page, which collects the
      // rest. The referral code, if the customer arrived on a link with one,
      // goes with them.
      router.replace(
        (params.ref ? `/signup?ref=${encodeURIComponent(params.ref)}` : "/signup") as never
      );
    }
  };

  if (signedIn) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Your account" subtitle="You're signed in" />
        <View className="px-4">
          <Card className="mt-1 p-4">
            <Txt size="lg" weight="bold">
              {authUser?.name || "Signed in"}
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              {authUser?.phone || authUser?.email}
            </Txt>
          </Card>

          <Pressable
            onPress={() => {
              signOut();
              // Straight to the gate, which is what "signed out" now means.
              router.replace("/signin");
            }}
            className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-tile border border-brand-500 active:opacity-70"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.brand[600]} />
            <Txt weight="bold" tone="brand">
              Sign out
            </Txt>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#fff7f2]">
      {/*
        No header bar. The client asked for a single screen with nothing to
        skip past: this is the first thing a customer meets, and a "Skip" in
        the corner invites them to leave before they have arrived.
      */}
      <View className="flex-1 justify-center pb-2">
        {/*
          The brand first, then what the app is for, then the form on a card
          that curves up over the artwork - the shape the client's design
          asked for. The mark is the full wordmark rather than the round app
          icon: the icon belongs on a home screen, not at the top of a page.
        */}
        <View className="items-center px-5 pb-2 pt-1">
          <Image
            source={require("../../assets/images/wordmark.png")}
            style={{ width: 250, height: 86 }}
            resizeMode="contain"
            accessibilityLabel="Reditoe"
          />

          <Txt size="2xl" weight="bold" className="mt-2 text-center leading-tight">
            Good Food,
          </Txt>
          <Txt size="2xl" weight="bold" tone="brand" className="text-center leading-tight">
            Great Mood!
          </Txt>
          <View className="mt-1.5 h-1 w-14 rounded-full bg-brand-500" />
          <Txt size="tiny" tone="muted" className="mt-2 text-center">
            Your favourite food, delivered fast to your door.
          </Txt>

          {/* Three plates and the scooter that brings them. */}
          <View className="mt-4 w-full flex-row items-end justify-center gap-2">
            {(["noodles", "burger", "pizza"] as const).map((dish, index) => (
              <Image
                key={dish}
                source={{ uri: hero(dish, 400) }}
                style={{
                  width: index === 1 ? 104 : 88,
                  height: index === 1 ? 104 : 88,
                  borderRadius: index === 1 ? 52 : 44,
                }}
                resizeMode="cover"
                accessibilityLabel=""
              />
            ))}
          </View>
        </View>

        <Card className="mx-4 mt-1 rounded-t-[26px] p-4">
          <Txt size="lg" weight="bold">
            Welcome! 👋
          </Txt>
          <Txt size="tiny" tone="muted" className="mb-1 mt-0.5">
            {awaitingCode
              ? `Enter the code we sent to +91 ${tenDigits(phone)}`
              : "Enter your mobile number to sign in or create an account"}
          </Txt>

          <Field
            label="Mobile number"
            value={phone}
            onChange={(next) => {
              setPhone(next.replace(/\D/g, "").slice(0, 10));
              if (awaitingCode) resetSteps();
            }}
            placeholder="98765 43210"
            prefix="+91"
            maxLength={10}
            autoFocus
            problem={
              phone.length === 10 && !isMobile(phone)
                ? "Enter a 10-digit number starting with 6, 7, 8 or 9."
                : null
            }
          />

          {awaitingCode && (
            <Field
              label="6-digit code"
              value={code}
              onChange={(next) => setCode(next.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              autoFocus
              oneTimeCode
            />
          )}

          {/* Resend, once the server's cooldown has run out. Shown only while a
              code is actually outstanding. */}
          {awaitingCode && (
            <Pressable
              disabled={resendIn > 0 || signingIn}
              onPress={() => void sendCode()}
              className="mt-3 flex-row items-center justify-center gap-1.5 active:opacity-70"
            >
              <Ionicons
                name="refresh-outline"
                size={15}
                color={resendIn > 0 ? colors.ink.faint : colors.brand[600]}
              />
              <Txt size="sm" weight="bold" tone={resendIn > 0 ? "faint" : "brand"}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </Txt>
            </Pressable>
          )}

          {notice && !authError && (
            <View className="mt-3">
              <Note icon="checkmark-circle" tone="ok" title={notice} />
            </View>
          )}

          {authError && (
            <View className="mt-3">
              <Note icon="alert-circle" tone="bad" title={authError} />
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={!ready || signingIn}
            className={`mt-5 h-13 items-center justify-center rounded-tile py-4 ${
              ready && !signingIn ? "bg-brand-600 active:opacity-90" : "bg-surface-sunken"
            }`}
          >
            <Txt size="lg" weight="bold" tone={ready && !signingIn ? "white" : "faint"}>
              {signingIn ? "Working…" : awaitingCode ? "Verify and continue" : "Send code"}
            </Txt>
          </Pressable>

          <Txt size="micro" tone="muted" className="mt-3 text-center">
            New to Reditoe? Enter your number — we&apos;ll set up your account once
            it&apos;s verified.
          </Txt>
        </Card>
      </View>
    </SafeAreaView>
  );
}
