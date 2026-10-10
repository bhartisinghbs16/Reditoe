import React from "react";
import { Pressable, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { EMPTY_DRAFT, saveDraft } from "@/lib/registration";
import {
  Button,
  Card,
  CheckBox,
  Field,
  IconPlate,
  Panel,
  Screen,
  Txt,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { RiderHero } from "@/components/brand";
import { useSession } from "@/lib/session";

/**
 * Create Account, reproduced from the reference: the courier artwork, the card
 * of fields with the terms tick and the red primary, then the "Why deliver
 * with Reditoe?" panel that closes the page.
 */

const REASONS = [
  {
    icon: "cash-outline" as const,
    tint: "green" as const,
    title: "High Earnings",
    detail: "More deliveries, more earnings",
  },
  {
    icon: "calendar-outline" as const,
    tint: "blue" as const,
    title: "Flexible Schedule",
    detail: "Choose your working hours",
  },
  {
    icon: "shield-checkmark-outline" as const,
    tint: "amber" as const,
    title: "Insurance Coverage",
    detail: "We've got you covered",
  },
];

/** The API rejects anything shorter, and says so less clearly than this does. */
const MIN_PASSWORD = 8;

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { signUp } = useSession();
  const [agreed, setAgreed] = React.useState(true);
  const [reveal, setReveal] = React.useState(false);
  const [confirmReveal, setConfirmReveal] = React.useState(false);

  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [referral, setReferral] = React.useState("");
  React.useEffect(() => {
    if (typeof params.ref === "string" && params.ref.trim()) setReferral(params.ref.trim().toUpperCase());
  }, [params.ref]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setError(null);

    if (!name.trim()) return setError("Enter your full name.");
    if (!phone.trim()) return setError("Enter your mobile number.");
    // The account is created against an email, so it cannot be optional here
    // even though the field is labelled that way in the reference.
    if (!email.trim()) return setError("Enter an email address to sign in with.");
    if (password.length < MIN_PASSWORD)
      return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");

    setBusy(true);
    try {
      /**
       * Held as a draft rather than creating the account here.
       *
       * The brief ends registration at Submit Application, not at sign-up, and
       * the remaining steps collect things the account needs anyway. Creating
       * it now would leave a half-registered rider behind every attempt
       * somebody abandons at the documents step.
       */
      await saveDraft({
        ...EMPTY_DRAFT,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        referralCode: referral.trim() || undefined,
        step: 0,
      });
      router.replace("/(auth)/register");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not start your application. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <AppBar title="" leading="back" />

      <View className="px-4">
        <Txt size="2xl" weight="bold">
          Create Account
        </Txt>
        <Txt size="sm" tone="muted" className="mt-0.5">
          Join Reditoe as a Delivery Partner
        </Txt>
      </View>

      <View className="mt-4 gap-3.5 px-4">
        <RiderHero height={180} />

        <Card className="p-4">
          <View className="gap-3">
            <Field
              placeholder="Enter Mobile Number"
              icon="call"
              prefix="+91"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Field
              placeholder="Full Name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
            />
            <Field
              placeholder="Email Address"
              icon="mail-outline"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              placeholder="Password"
              icon="lock-closed"
              secure={!reveal}
              trailing={reveal ? "eye-outline" : "eye-off-outline"}
              onTrailing={() => setReveal((on) => !on)}
              value={password}
              onChangeText={setPassword}
            />
            <Field
              placeholder="Confirm Password"
              icon="lock-closed"
              secure={!confirmReveal}
              trailing={confirmReveal ? "eye-outline" : "eye-off-outline"}
              onTrailing={() => setConfirmReveal((on) => !on)}
              value={confirm}
              onChangeText={setConfirm}
            />
            <Field
              placeholder="Referral Code (Optional)"
              icon="gift-outline"
              value={referral}
              onChangeText={setReferral}
            />
          </View>

          <View className="mt-4 flex-row items-start gap-2.5">
            <View className="pt-0.5">
              <CheckBox
                checked={agreed}
                onChange={setAgreed}
                accessibilityLabel="Agree to the terms and privacy policy"
              />
            </View>
            <Txt size="sm" tone="soft" className="flex-1">
              I agree to the{" "}
              <Txt size="sm" weight="semibold" tone="brand">
                Terms &amp; Conditions
              </Txt>{" "}
              and{" "}
              <Txt size="sm" weight="semibold" tone="brand">
                Privacy Policy
              </Txt>
            </Txt>
          </View>

          {error && (
            <Txt size="sm" tone="brand" className="mt-3">
              {error}
            </Txt>
          )}

          <Button
            label={busy ? "Creating account…" : "Sign Up"}
            accent="brand"
            size="lg"
            disabled={!agreed || busy}
            className="mt-4"
            onPress={submit}
          />

          <View className="mt-5 flex-row items-center justify-center gap-1">
            <Txt size="sm" tone="muted">
              Already have an account?
            </Txt>
            <Pressable onPress={() => router.replace("/login")} hitSlop={8}>
              <Txt size="sm" weight="bold" tone="brand">
                Login
              </Txt>
            </Pressable>
          </View>
        </Card>

        <Panel title="Why deliver with Reditoe?" bodyClassName="px-4 pb-4">
          <View className="gap-3.5">
            {REASONS.map((reason) => (
              <View key={reason.title} className="flex-row items-center gap-3">
                <IconPlate icon={reason.icon} tint={reason.tint} size={44} shape="circle" />
                <View className="min-w-0 flex-1">
                  <Txt weight="bold">{reason.title}</Txt>
                  <Txt size="tiny" tone="muted">
                    {reason.detail}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        </Panel>
      </View>
    </Screen>
  );
}
