import React from "react";
import { Pressable, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { clearDraft, loadDraft, saveDraft, type RiderDraft } from "@/lib/registration";
import {
  Button,
  Card,
  CheckBox,
  Field,
  IconPlate,
  Panel,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { RiderHero } from "@/components/brand";

/**
 * Create Account, reproduced from the reference: the courier artwork, the card
 * of fields with the terms tick and the red primary, then the "Why deliver
 * with Reditoe?" panel that closes the page.
 *
 * Reached from Login, once the mobile number has been verified and turned out
 * not to belong to anybody. The number is shown as verified and is not asked
 * for again; there is no password to choose, since sign-in is by a code sent to
 * that number.
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();

  /** The application so far: at least the verified number, or we are not here. */
  const [draft, setDraft] = React.useState<RiderDraft | null>(null);
  const [agreed, setAgreed] = React.useState(true);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [referral, setReferral] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const saved = await loadDraft();
      if (!saved || !saved.phoneProof) {
        // No verified number: the way into this screen is Login, which is where
        // the number gets verified.
        router.replace("/(auth)/login");
        return;
      }
      setDraft(saved);
      setName(saved.name);
      setEmail(saved.email);
      setReferral(saved.referralCode ?? "");
    })();
  }, [router]);

  React.useEffect(() => {
    if (typeof params.ref === "string" && params.ref.trim()) setReferral(params.ref.trim().toUpperCase());
  }, [params.ref]);

  if (!draft) return null;

  async function submit() {
    if (!draft) return;
    setError(null);

    if (name.trim().length < 2) return setError("Enter your full name.");
    // The account is created against an email, so it cannot be optional here
    // even though the field is labelled that way in the reference.
    if (!EMAIL.test(email.trim())) return setError("Enter a valid email address.");

    setBusy(true);
    try {
      /**
       * Held as a draft rather than creating the account here.
       *
       * The brief ends registration at Submit Application, not at sign-up, and
       * the remaining steps collect things the account needs anyway. Creating
       * it now would leave a half-registered partner behind every attempt
       * somebody abandons at the documents step.
       */
      await saveDraft({
        ...draft,
        name: name.trim(),
        email: email.trim(),
        referralCode: referral.trim() || undefined,
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

  /** Back to the number: a different one may be the one they meant. */
  const backToLogin = async () => {
    await clearDraft();
    router.replace("/(auth)/login");
  };

  return (
    <Screen>
      <AppBar title="" leading="back" onLeading={backToLogin} />

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
            {/* The number, as verified. Not editable: it is what the account is for. */}
            <View className="min-h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface-sunken px-3 py-3">
              <Ionicons name="call" size={18} color={colors.ink.muted} />
              <Txt weight="semibold" className="flex-1">
                +91 {draft.phone}
              </Txt>
              <Ionicons name="checkmark-circle" size={17} color={colors.green[600]} />
              <Txt size="tiny" weight="semibold" className="text-green-600">
                Verified
              </Txt>
            </View>

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
            label={busy ? "Saving…" : "Continue"}
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
            <Pressable onPress={backToLogin} hitSlop={8}>
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
