import React from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { hero } from "@/lib/images";
import { useStore } from "@/lib/store";

/**
 * Sign in / create account.
 *
 * The reference set has no auth screen, so this follows the language of the
 * screens it does show. It exists because order history, the wallet, saved
 * addresses, refunds and Reditoe Plus are all behind a token — without it
 * those screens can only ever show sample data.
 */

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
  autoCapitalize = "none",
  problem,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address" | "phone-pad";
  autoCapitalize?: "none" | "words";
  /**
   * What is wrong with what has been typed, shown under the field. Callers
   * pass null until there is something to say, so an empty field is never
   * scolded for being empty.
   */
  problem?: string | null;
}) {
  const [focused, setFocused] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);

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
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.ink.faint}
          secureTextEntry={secure && !reveal}
          keyboardType={keyboard}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 p-0 text-[15px] text-ink"
        />
        {secure && (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={8}>
            <Ionicons
              name={reveal ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={colors.ink.faint}
            />
          </Pressable>
        )}
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
  const [referralCode, setReferralCode] = React.useState("");
  React.useEffect(() => {
    if (typeof params.ref === "string" && params.ref.trim()) setReferralCode(params.ref.trim().toUpperCase());
  }, [params.ref]);
  const {
    signIn,
    signUp,
    verifyAccount,
    resendVerification,
    signOut,
    requestOtp,
    signInWithOtp,
    requestPasswordReset,
    resetPassword,
    signedIn,
    signingIn,
    authError,
    authUser,
    apiBase,
  } = useStore();

/** The ways in. OTP is first because it needs the least of a new customer. */
type Mode = "otp" | "in" | "up" | "forgot" | "confirm";

/** Matches the server's rule, so the form can refuse before the round trip. */
const MIN_PASSWORD = 8;

/** Ten digits starting 6-9 — the ranges Indian mobile numbers actually use. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isMobile = (value: string) => INDIAN_MOBILE.test(value.replace(/\D/g, "").slice(-10));
const isEmail = (value: string) => EMAIL.test(value.trim());

/** What is wrong with this password, or null. */
function passwordProblem(value: string) {
  if (value.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Za-z]/.test(value)) return "Include at least one letter.";
  if (!/\d/.test(value)) return "Include at least one number.";
  return null;
}

  const [mode, setMode] = React.useState<Mode>("in");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  // OTP and reset both run in two steps; this tracks which one is showing.
  const [contact, setContact] = React.useState("");
  const [code, setCode] = React.useState("");
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  /** Seconds until another code can be asked for; the server sets the cooldown. */
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const creating = mode === "up";

  /** Terms are only gated on account creation - signing in is not consent. */
  const needsConsent = creating;

  const ready = (() => {
    if (mode === "confirm") return code.trim().length >= 4;

    if (mode === "otp") {
      return awaitingCode ? code.trim().length >= 4 : contact.trim().length >= 6;
    }
    if (mode === "forgot") {
      return awaitingCode
        ? code.trim().length >= 4 && password.length >= MIN_PASSWORD && password === confirm
        : email.trim().length > 3;
    }
    if (creating) {
      return Boolean(
        name.trim().length >= 2 &&
          isEmail(email) &&
          isMobile(phone) &&
          !passwordProblem(password) &&
          password === confirm &&
          agreed
      );
    }
    // Sign-in takes either identifier, so anything plausible is allowed
    // through and the server decides.
    return Boolean(email.trim() && password.length > 0);
  })();

  /**
   * Where to go once signed in.
   *
   * This screen is now what an unauthenticated visitor is sent to, so there is
   * usually nothing behind it — `router.back()` would leave them staring at
   * the same form. Going back is right only when they opened it themselves
   * from somewhere inside the app.
   */
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  /**
   * Asks for another code.
   *
   * Not submit(): with a code outstanding, submit() is the *verify* step, so
   * reusing it here would check an empty box instead of sending anything.
   */
  const resend = async () => {
    setNotice(null);
    const res =
      mode === "confirm"
        ? await resendVerification(email)
        : mode === "otp"
          ? await requestOtp(contact)
          : await requestPasswordReset(email);
    if (!res.ok) return;
    setCode(res.code ?? "");
    setResendIn(60);
    setNotice(
      res.code
        ? "This server cannot send messages, so the new code is filled in for you."
        : "A new code is on its way."
    );
  };

  const resetSteps = () => {
    setAwaitingCode(false);
    setCode("");
    setNotice(null);
    setResendIn(0);
  };

  const submit = async () => {
    if (mode === "otp") {
      if (!awaitingCode) {
        const res = await requestOtp(contact);
        if (!res.ok) return;
        setAwaitingCode(true);
        setResendIn(60);
        // The server hands the code back when it cannot deliver it, so fill
        // it in rather than asking someone to read a server log.
        if (res.code) {
          setCode(res.code);
          setNotice("This server cannot send messages, so the code is filled in for you.");
        } else {
          setNotice(`Code sent to ${contact.trim()}.`);
        }
        return;
      }
      if (await signInWithOtp(contact, code)) leave();
      return;
    }

    if (mode === "forgot") {
      if (!awaitingCode) {
        const res = await requestPasswordReset(email);
        if (!res.ok) return;
        setAwaitingCode(true);
        setResendIn(60);
        if (res.code) {
          setCode(res.code);
          setNotice("This server cannot send email, so the code is filled in for you.");
        } else {
          setNotice(`Code sent to ${email.trim()}.`);
        }
        return;
      }
      if (await resetPassword(email, code, password)) {
        setMode("in");
        resetSteps();
        setPassword("");
        setConfirm("");
        setNotice("Password changed. Sign in with it below.");
      }
      return;
    }

    if (creating) {
      const res = await signUp(
        name.trim(),
        email.trim(),
        password,
        phone.replace(/\D/g, "").slice(-10),
        referralCode || undefined
      );
      if (!res.ok) return;
      // The account exists but is not usable yet; the code is the next step.
      setMode("confirm");
      setAwaitingCode(true);
      setResendIn(60);
      setCode(res.code ?? "");
      setNotice(
        res.code
          ? "This server cannot send messages, so the code is filled in for you."
          : `We sent a code to your ${res.channel === "phone" ? "mobile number" : "email"}.`
      );
      return;
    }

    if (mode === "confirm") {
      if (await verifyAccount(email.trim(), code)) leave();
      return;
    }

    if (await signIn(email.trim(), password)) leave();
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
              {authUser?.email}
            </Txt>
            <Txt size="micro" tone="faint" className="mt-2">
              Connected to {apiBase}
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

  /** The line under the welcome, which changes with what is being asked. */
  const prompt =
    mode === "confirm"
      ? `Enter the code we sent to ${email.trim() || "you"}`
      : mode === "forgot"
        ? "We will send a code to reset it"
        : creating
          ? "Create an account to get started"
          : "Sign in to continue to your account";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#fff7f2]">
      {/*
        No header bar. The client asked for a single screen with nothing to
        skip past: this is the first thing a customer meets, and a "Skip" in
        the corner invites them to leave before they have arrived.
      */}
      <View className="flex-1 justify-center pb-2">
        {/*
          The screen was a title and a row of empty boxes - the first thing a
          new customer saw of Reditoe was a form with nothing on it. It now
          leads with the brand and what the app is for, and the form sits on a
          card lifted over the artwork, which is the shape the client asked
          for.
        */}
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
            {creating ? "Welcome!" : "Welcome back!"} 👋
          </Txt>
          <Txt size="tiny" tone="muted" className="mb-1 mt-0.5">
            {prompt}
          </Txt>

          {/*
            The two ways in, side by side rather than buried in a link. A
            customer who wants a code and a customer who has a password are
            both here, and neither should have to hunt.
          */}
          {/* One-time code: contact first, then the code itself. */}
          {mode === "otp" && (
            <>
              <Field
                label="Mobile number or email"
                value={contact}
                onChange={(next) => {
                  setContact(next);
                  if (awaitingCode) resetSteps();
                }}
                placeholder="9123456789 or you@example.com"
              />
              {awaitingCode && (
                <Field
                  label="Six-digit code"
                  value={code}
                  onChange={setCode}
                  placeholder="123456"
                  keyboard="phone-pad"
                />
              )}
            </>
          )}

          {mode === "confirm" && (
            <Field
              label="Six-digit code"
              value={code}
              onChange={setCode}
              placeholder="123456"
              keyboard="phone-pad"
            />
          )}

          {mode === "forgot" && (
            <>
              <Field
                label="Email"
                value={email}
                onChange={(next) => {
                  setEmail(next);
                  if (awaitingCode) resetSteps();
                }}
                placeholder="you@example.com"
                keyboard="email-address"
              />
              {awaitingCode && (
                <>
                  <Field
                    label="Six-digit code"
                    value={code}
                    onChange={setCode}
                    placeholder="123456"
                    keyboard="phone-pad"
                  />
                  <Field
                    label="New password"
                    value={password}
                    onChange={setPassword}
                    placeholder={`At least ${MIN_PASSWORD} characters`}
                    secure
                  />
                  <Field
                    label="Confirm password"
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Repeat it"
                    secure
                  />
                </>
              )}
            </>
          )}

          {creating && (
            <Field
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Mohan Kumar"
              autoCapitalize="words"
            />
          )}

          {mode === "in" && (
            <Field
              label="Email or mobile number"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com or 9123456789"
            />
          )}

          {creating && (
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              keyboard="email-address"
              problem={email && !isEmail(email) ? "That email does not look right." : null}
            />
          )}

          {creating && (
            <Field
              label="Mobile number"
              value={phone}
              onChange={setPhone}
              placeholder="9123456789"
              keyboard="phone-pad"
              problem={
                phone && !isMobile(phone)
                  ? "Enter a 10-digit number starting with 6, 7, 8 or 9."
                  : null
              }
            />
          )}

          {(mode === "in" || mode === "up") && (
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder={creating ? `At least ${MIN_PASSWORD} characters` : "Your password"}
              secure
              problem={creating && password ? passwordProblem(password) : null}
            />
          )}

          {creating && (
            <Field
              label="Re-enter password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Type it again"
              secure
              problem={
                confirm && confirm !== password ? "The two passwords do not match." : null
              }
            />
          )}

          {/* Consent is required to create an account, and only then - a
              returning customer already agreed. */}
          {needsConsent && (
            <Pressable
              onPress={() => setAgreed((on) => !on)}
              className="mt-4 flex-row items-start gap-2.5 active:opacity-70"
            >
              <Ionicons
                name={agreed ? "checkbox" : "square-outline"}
                size={20}
                color={agreed ? colors.brand[600] : colors.ink.faint}
              />
              <Txt size="sm" tone="muted" className="flex-1">
                I agree to the{" "}
                <Txt size="sm" weight="bold" tone="brand">
                  Terms &amp; Conditions
                </Txt>{" "}
                and{" "}
                <Txt size="sm" weight="bold" tone="brand">
                  Privacy Policy
                </Txt>
              </Txt>
            </Pressable>
          )}

          {/* Resend, once the server's cooldown has run out. Shown only while a
              code is actually outstanding. */}
          {(mode === "confirm" || (awaitingCode && (mode === "otp" || mode === "forgot"))) && (
            <Pressable
              disabled={resendIn > 0 || signingIn}
              onPress={() => void resend()}
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
              {signingIn
                ? "Working…"
                : mode === "confirm"
                  ? "Confirm and continue"
                  : mode === "otp"
                  ? awaitingCode
                    ? "Verify and sign in"
                    : "Send code"
                  : mode === "forgot"
                    ? awaitingCode
                      ? "Change password"
                      : "Send code"
                    : creating
                      ? "Create account"
                      : "Sign in"}
            </Txt>
          </Pressable>

          {/* Every other way in, one tap away. Which ones show depends on
              where you are, so the list never offers the screen you are on. */}
          {/* Hidden while confirming: a half-created account has one next step,
              and offering four ways elsewhere is how someone abandons it. */}
          <View className="mt-4 gap-2.5">
            {mode !== "otp" && mode !== "confirm" && (
              <Pressable
                onPress={() => { setMode("otp"); resetSteps(); }}
                className="flex-row items-center justify-center gap-1.5 active:opacity-70"
              >
                <Ionicons name="keypad-outline" size={15} color={colors.brand[600]} />
                <Txt size="sm" weight="bold" tone="brand">
                  Use a one-time code instead
                </Txt>
              </Pressable>
            )}

            {mode !== "in" && mode !== "up" && mode !== "confirm" && (
              <Pressable
                onPress={() => { setMode("in"); resetSteps(); }}
                className="flex-row items-center justify-center gap-1.5 active:opacity-70"
              >
                <Ionicons name="mail-outline" size={15} color={colors.brand[600]} />
                <Txt size="sm" weight="bold" tone="brand">
                  Sign in with a password
                </Txt>
              </Pressable>
            )}

            {mode === "in" && (
              <Pressable
                onPress={() => { setMode("forgot"); resetSteps(); }}
                className="flex-row items-center justify-center active:opacity-70"
              >
                <Txt size="sm" weight="bold" tone="brand">
                  Forgot your password?
                </Txt>
              </Pressable>
            )}


          </View>
        </Card>

        {/*
          The way to the other door, as a card rather than a line of small
          text - it is the second most likely thing to be tapped on this
          screen and was the least visible.
        */}
        {(mode === "in" || mode === "up" || mode === "otp") && (
          <Pressable
            onPress={() => { setMode(creating ? "in" : "up"); resetSteps(); }}
            className="mx-4 mt-3 flex-row items-center gap-3 rounded-card border border-brand-100 bg-brand-50 px-3 py-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-surface">
              <Ionicons
                name={creating ? "log-in-outline" : "bag-handle-outline"}
                size={19}
                color={colors.brand[600]}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">
                {creating ? "Already have an account?" : "New to Reditoe?"}
              </Txt>
              <Txt size="tiny" tone="brand">
                {creating ? "Sign in instead" : "Create an account to get started"}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand[600]} />
          </Pressable>
        )}

        {/*
          The trust badges, the "why sign in" note and the server line used to
          sit here. The client asked for a single screen that does not scroll,
          and they were what pushed it past the bottom of the phone.
        */}
      </View>
    </SafeAreaView>
  );
}
