import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  Card,
  FootNote,
  IconPlate,
  NoteBar,
  Screen,
  SectionTitle,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { StepTrack } from "@/components/tracker";
import { ScooterMark } from "@/components/brand";
import { KYC_STEPS } from "@/components/kyc";
import type { TintName } from "@/lib/theme";

/**
 * Document Verification, the screen that closes onboarding: the green success
 * panel, the four verified documents, what happens next, and the button
 * through to the Dashboard.
 */

const VERIFIED: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  title: string;
  value: string;
  href: string;
}[] = [
  {
    icon: "id-card",
    tint: "green",
    title: "Aadhaar Card",
    value: "XXXX XXXX 5678",
    href: "/document/aadhaar",
  },
  {
    icon: "card",
    tint: "blue",
    title: "PAN Card",
    value: "ABCDE1234F",
    href: "/document/pan",
  },
  {
    icon: "car-sport",
    tint: "violet",
    title: "Driving License",
    value: "TN02 20200012345",
    href: "/document/licence",
  },
  {
    icon: "business",
    tint: "amber",
    title: "Bank Details",
    value: "SBI • XXXX 5678",
    href: "/document/passbook",
  },
];

export default function VerificationDone() {
  const router = useRouter();

  return (
    <Screen>
      <AppBar title="Document Verification" leading="back" />

      <View className="bg-surface px-4 pb-4">
        {/* Every stop is done, so the tracker sits one past the last step. */}
        <StepTrack steps={KYC_STEPS} current={KYC_STEPS.length} />
      </View>

      <View className="mt-4 gap-3.5 px-4">
        <View
          style={{ backgroundColor: "#edf9f1", borderColor: "#cdebd8" }}
          className="items-center rounded-card border px-5 py-6"
        >
          <View
            style={{ backgroundColor: colors.green[600] }}
            className="h-[74px] w-[74px] items-center justify-center rounded-full"
          >
            <Ionicons name="checkmark" size={40} color="#ffffff" />
          </View>

          <Txt size="xl" weight="bold" tone="green" className="mt-3.5 text-center">
            All Documents Verified Successfully!
          </Txt>
          <Txt size="sm" tone="soft" className="mt-1 text-center">
            Your documents have been verified and are valid.
          </Txt>

          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="shield-checkmark" size={16} color={colors.green[600]} />
            <Txt size="sm" weight="bold" tone="ok">
              100% Secure Verification
            </Txt>
          </View>
        </View>

        <SectionTitle title="Verified Documents" />

        <Card className="overflow-hidden">
          {VERIFIED.map((doc, index) => (
            <Pressable
              key={doc.title}
              onPress={() => router.push(doc.href as never)}
              className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-80 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <IconPlate icon={doc.icon} tint={doc.tint} size={42} shape="circle" />
              <View className="min-w-0 flex-1">
                <Txt weight="bold" numberOfLines={1}>
                  {doc.title}
                </Txt>
                <Txt size="tiny" tone="muted" numberOfLines={1}>
                  {doc.value}
                </Txt>
              </View>
              <Badge label="Verified" tone="ok" icon="checkmark-circle" />
              <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
            </Pressable>
          ))}
        </Card>

        <NoteBar
          tone="blue"
          icon="information-circle"
          title="What's Next?"
          detail="Your documents will be reviewed by our team. You will be notified once your account is activated."
        />

        <View
          style={{ backgroundColor: "#fff8eb", borderColor: "#fbe3b8" }}
          className="flex-row items-center gap-3 rounded-card border p-4"
        >
          <ScooterMark size={54} />
          <View className="min-w-0 flex-1">
            <Txt size="lg" weight="bold">
              You&apos;re almost ready to deliver!
            </Txt>
            <Txt size="sm" tone="muted" className="mt-0.5">
              Complete your profile and start earning with Reditoe.
            </Txt>
          </View>
        </View>

        <Button
          label="Continue to Dashboard"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          onPress={() => router.replace("/(tabs)")}
        />

        <FootNote text="Your information is safe with us and will never be shared." />
      </View>
    </Screen>
  );
}
