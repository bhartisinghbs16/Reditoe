import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { Card, Divider, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";

/**
 * About Reditoe.
 *
 * The row was in the account menu with nothing behind it. What belongs here is
 * what somebody actually opens an about screen for: who the app is from, which
 * version they are running — which is the first thing to ask for when a bug is
 * reported — and how to reach the company.
 */
const SUPPORT_EMAIL = "support@reditoe.com";

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "—";
  const build = Constants.expoConfig?.android?.versionCode;

  const rows: { label: string; value: string }[] = [
    { label: "App version", value: build ? `${version} (${build})` : version },
    { label: "Company", value: "Reditoe India LLP" },
    { label: "Location", value: "Tirupati, Andhra Pradesh" },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="About Reditoe" subtitle="App and company details" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <Card className="mx-4 mt-1 items-center p-5">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <Ionicons name="restaurant" size={30} color={colors.brand[600]} />
          </View>
          <Txt size="xl" weight="bold" className="mt-3">
            Reditoe
          </Txt>
          <Txt size="tiny" tone="muted">
            Ready To Eat
          </Txt>
        </Card>

        <Card className="mx-4 mt-4 overflow-hidden">
          {rows.map((row, index) => (
            <React.Fragment key={row.label}>
              {index > 0 && <Divider />}
              <View className="flex-row items-center justify-between px-3 py-3.5">
                <Txt size="sm" tone="soft">
                  {row.label}
                </Txt>
                <Txt size="sm" weight="semibold">
                  {row.value}
                </Txt>
              </View>
            </React.Fragment>
          ))}
        </Card>

        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          accessibilityLabel="Email Reditoe support"
          className="mx-4 mt-4 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-3.5 active:opacity-80"
        >
          <Ionicons name="mail-outline" size={20} color={colors.brand[600]} />
          <View className="min-w-0 flex-1">
            <Txt weight="semibold">Contact us</Txt>
            <Txt size="tiny" tone="muted">
              {SUPPORT_EMAIL}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
