import React from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, Divider, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { registerForPush, unregisterForPush } from "@/lib/push";

/**
 * Notification preferences.
 *
 * The account menu offered "Manage your notification preferences" as a row
 * with no destination — pressing it did nothing. The switch below is the one
 * that actually does something: off unregisters this phone, so the server
 * stops sending to it, and on registers it again.
 *
 * The preference is remembered on the device, because it is a fact about this
 * phone rather than about the account: the same customer may want alerts on
 * their own handset and not on a shared one.
 */
const KEY = "reditoe.notifications.enabled";

export default function NotificationsScreen() {
  const [enabled, setEnabled] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((stored) => setEnabled(stored !== "off"))
      .catch(() => {
        /* Never read: leave the default on, which is what a fresh app does. */
      });
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    try {
      if (next) await registerForPush();
      else await unregisterForPush();
      await AsyncStorage.setItem(KEY, next ? "on" : "off");
    } catch (error) {
      // Put the switch back rather than showing a setting that did not take.
      setEnabled(!next);
      Alert.alert(
        "Couldn't change that",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Notifications" subtitle="What this phone is told about" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <Card className="mx-4 mt-1 overflow-hidden">
          <View className="flex-row items-center gap-3 px-3 py-3.5">
            <View className="min-w-0 flex-1">
              <Txt weight="semibold">Order updates</Txt>
              <Txt size="tiny" tone="muted">
                When your order is accepted, picked up and delivered
              </Txt>
            </View>
            <Switch
              value={enabled}
              onValueChange={toggle}
              disabled={busy}
              accessibilityLabel="Order update notifications"
              trackColor={{ true: colors.brand[600], false: colors.line.strong }}
            />
          </View>

          <Divider />

          <View className="px-3 py-3.5">
            <Txt size="tiny" tone="muted">
              {enabled
                ? "This phone will receive order updates."
                : "This phone will not receive any notifications."}
            </Txt>
          </View>
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="information-circle"
            tone="info"
            title="Your phone's own settings can also block notifications. If nothing arrives with this switched on, check Reditoe under Android notification settings."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
