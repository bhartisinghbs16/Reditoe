import React from "react";
import { AppState, Platform, View } from "react-native";
import * as Updates from "expo-updates";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Txt } from "@/components/ui";
import { colors } from "@/lib/theme";

/**
 * Tells the vendor a new version is ready, and lets them restart into it.
 *
 * An over-the-air update is downloaded in the background and, left alone, only
 * takes over the *next* time the app starts - so a fix that had been published
 * still needed the app opened, closed and opened again before anyone saw it.
 * This asks the server on launch and whenever the app comes back to the front,
 * and the moment an update has finished downloading it offers the restart.
 *
 * Offered, not forced: a kitchen in the middle of an order should not have the
 * app restart under it. "Later" hides it until the app is next brought back
 * after a spell away, or opened again.
 *
 * Nothing in a development build, the web build or Expo Go: they have no
 * updates to apply.
 */

/** Looking at most this often while the app is simply left open on the counter. */
const RECHECK_AFTER_MS = 10 * 60 * 1000;

/** Away this long, and "Later" is forgotten on return. Glancing at another app is not. */
const AWAY_LONG_ENOUGH_MS = 5 * 60 * 1000;

export function UpdatePrompt() {
  if (__DEV__ || Platform.OS === "web" || !Updates.isEnabled) return null;
  return <Prompt />;
}

/** Split out so the hook below only runs where updates exist at all. */
function Prompt() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);

  const pending = React.useRef(isUpdatePending);
  pending.current = isUpdatePending;

  React.useEffect(() => {
    let lastCheck = 0;
    let leftAt: number | null = null;

    const look = async () => {
      if (pending.current || Date.now() - lastCheck < RECHECK_AFTER_MS) return;
      lastCheck = Date.now();
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // No connection, or the server is busy. Asked again on the next return.
      }
    };

    void look();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        leftAt = Date.now();
        return;
      }
      if (state !== "active") return;
      if (leftAt !== null && Date.now() - leftAt >= AWAY_LONG_ENOUGH_MS) setDismissed(false);
      leftAt = null;
      void look();
    });
    return () => subscription.remove();
  }, []);

  if (!isUpdatePending || dismissed) return null;

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // The restart did not happen; the card stays so it can be tried again.
      setRestarting(false);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: Math.max(insets.bottom, 12) + 8,
        zIndex: 1000,
        elevation: 1000,
      }}
    >
      <Card raised className="p-4" accessibilityRole="alert">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="sparkles" size={20} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Txt weight="bold">Update ready</Txt>
            <Txt size="sm" tone="muted" className="mt-0.5">
              A new version of Reditoe Vendor is ready. Restart to start using it.
            </Txt>
          </View>
        </View>
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Later"
              variant="plain"
              onPress={() => setDismissed(true)}
              disabled={restarting}
            />
          </View>
          <View className="flex-1">
            <Button
              label="Restart now"
              accent="brand"
              onPress={() => void restart()}
              loading={restarting}
            />
          </View>
        </View>
      </Card>
    </View>
  );
}
