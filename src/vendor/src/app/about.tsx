import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Divider, Txt, colors } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/screen-header";

/**
 * About. Opened Restaurant Information before, like most of the More menu.
 */
const LINKS = [
  { label: "Privacy Policy", url: "https://www.reditoe.com/privacy.html" },
  { label: "Terms & Conditions", url: "https://www.reditoe.com/terms.html" },
  { label: "Refund Policy", url: "https://www.reditoe.com/refunds.html" },
];

export default function About() {
  const version = Constants.expoConfig?.version ?? "—";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="About Reditoe Vendor" />
      <ScrollView contentContainerClassName="pb-10">
        <Card className="mx-4 mt-3 p-4">
          <Txt weight="bold" size="lg">
            Reditoe Vendor Partner
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-1">
            Version {version}
          </Txt>
          <Txt size="sm" tone="muted" className="mt-3">
            Manage your menu, take orders and track your payouts. Operated by
            Reditoe India LLP, Tirupati.
          </Txt>
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
