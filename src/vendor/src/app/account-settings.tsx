import React from "react";
import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Divider, Txt } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";

/**
 * The account itself: who is signed in, and how to leave.
 *
 * Account Settings on the More menu opened Restaurant Information, which is
 * about the restaurant rather than the person signed into it.
 */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row items-center justify-between px-3 py-3">
      <Txt size="sm" tone="muted">
        {label}
      </Txt>
      <Txt size="sm" weight="semibold" numberOfLines={1} className="ml-3 max-w-[60%]">
        {value?.trim() && value !== "—" ? value : "Not provided"}
      </Txt>
    </View>
  );
}

export default function AccountSettings() {
  const router = useRouter();
  const { session, vendor, signOut } = useStore();

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will need your password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Account Settings" />
      <ScrollView contentContainerClassName="pb-10">
        <Card className="mx-4 mt-3 overflow-hidden">
          <Row label="Name" value={session?.name} />
          <Divider />
          <Row label="Email" value={session?.email} />
          <Divider />
          <Row label="Phone" value={session?.phone} />
          <Divider />
          <Row label="Outlet" value={vendor.name} />
          <Divider />
          <Row label="Outlet ID" value={vendor.outletId} />
        </Card>

        <Txt size="tiny" tone="muted" className="mx-4 mt-3">
          To change your name, email or phone number, contact Reditoe support.
          These identify your account at sign-in.
        </Txt>

        <View className="mx-4 mt-4">
          <Button label="Sign out" variant="plain" onPress={confirmSignOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
