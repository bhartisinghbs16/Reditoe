import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/lib/api";

/**
 * Registering this device for push.
 *
 * The server has been able to send notifications all along — Firebase is
 * configured and the SDK initialises — but nothing ever told it where to send
 * them. No app asked Android for a token or handed one over, so `fcmTokens`
 * was empty for every account and every send had nowhere to go.
 *
 * The token is the device's, not the account's, so it is registered after
 * sign-in and withdrawn on sign-out; otherwise the next person to sign in on
 * a shared phone would keep receiving the last one's orders.
 */

/** Remembered so sign-out can withdraw exactly what was registered. */
let registered: string | null = null;

/** A heads-up banner while the app is open, not just in the tray. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function deviceToken(): Promise<string | null> {
  // Android delivers through FCM, which needs google-services.json compiled
  // into the build; without it this throws rather than returning nothing.
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted ||
      (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return null;

    if (Platform.OS === "android") {
      // Orders need to interrupt; the default channel is too quiet for work.
      await Notifications.setNotificationChannelAsync("orders", {
        name: "New orders",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    const { data } = await Notifications.getDevicePushTokenAsync();
    return typeof data === "string" ? data : null;
  } catch {
    // No Firebase config in this build, or no Play Services on the device.
    return null;
  }
}

/** Called once the vendor is signed in. Quietly does nothing if it cannot. */
export async function registerForPush(): Promise<void> {
  const token = await deviceToken();
  if (!token || token === registered) return;
  try {
    await api.post("/push-notifications/token", {
      token,
      deviceInfo: { platform: Platform.OS, app: "vendor" },
    });
    registered = token;
  } catch {
    // Not worth blocking a shift over; the next sign-in tries again.
  }
}

/** Called on sign-out, so this phone stops receiving that account's orders. */
export async function unregisterForPush(): Promise<void> {
  if (!registered) return;
  const token = registered;
  registered = null;
  try {
    await api.delete("/push-notifications/token", { token });
  } catch {
    // The server drops unknown tokens on the first failed send anyway.
  }
}
