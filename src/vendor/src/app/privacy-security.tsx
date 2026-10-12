import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Divider, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";

/**
 * What Reditoe does with this restaurant's data, and where to read the rest.
 *
 * Privacy & Security on the More menu opened Restaurant Information.
 */
const LINKS = [
  { label: "Privacy Policy", url: "https://www.reditoe.com/privacy.html" },
  { label: "Terms & Conditions", url: "https://www.reditoe.com/terms.html" },
];

const POINTS = [
  {
    icon: "lock-closed-outline" as const,
    title: "You sign in with a one-time code, not a password",
    detail: "There is no password to leak or forget. Never share your code with anyone, including Reditoe support.",
  },
  {
    icon: "card-outline" as const,
    title: "Card details never reach this app",
    detail: "Customer payments are handled by the payment gateway directly.",
  },
  {
    icon: "location-outline" as const,
    title: "Your address is used to price delivery",
    detail: "Distance from your kitchen to the customer decides the fee.",
  },
  {
    icon: "document-text-outline" as const,
    title: "Your documents are visible only to Reditoe staff",
    detail: "They are used to verify your restaurant and nothing else.",
  },
];

export default function PrivacySecurity() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Privacy & Security" />
      <ScrollView contentContainerClassName="pb-10">
        <Card className="mx-4 mt-3 overflow-hidden">
          {POINTS.map((point, index) => (
            <View key={point.title}>
              {index > 0 && <Divider />}
              <View className="flex-row gap-3 px-3 py-3">
                <Ionicons name={point.icon} size={18} color={colors.ink.muted} />
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="semibold">
                    {point.title}
                  </Txt>
                  <Txt size="tiny" tone="muted" className="mt-0.5">
                    {point.detail}
                  </Txt>
                </View>
              </View>
            </View>
          ))}
        </Card>

        <Card className="mx-4 mt-3 overflow-hidden">
          {LINKS.map((link, index) => (
            <View key={link.label}>
              {index > 0 && <Divider />}
              <Pressable
                onPress={() => Linking.openURL(link.url)}
                className="flex-row items-center justify-between px-3 py-3.5 active:opacity-70"
              >
                <Txt size="sm" weight="semibold">
                  {link.label}
                </Txt>
                <Ionicons name="open-outline" size={16} color={colors.ink.faint} />
              </Pressable>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
