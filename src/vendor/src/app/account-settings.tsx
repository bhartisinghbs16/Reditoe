import React from "react";
import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Divider, Txt } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";
import { deleteAccount } from "@/lib/api";

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
    Alert.alert("Sign out?", "You will need your mobile number and a one-time code to sign back in.", [
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

  const confirmDelete = () =>
    Alert.alert(
      "Delete your account?",
      "This permanently erases your account details and switches your restaurant off. Order and payout records the law requires us to keep stay, without your personal details. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              await signOut();
              router.replace("/login");
            } catch (error) {
              Alert.alert(
                "Could not delete account",
                error instanceof Error ? error.message : "Please try again."
              );
            }
          },
        },
      ]
    );

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
        <View className="mx-4 mt-2">
          <Button label="Delete account" variant="plain" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
