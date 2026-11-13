import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api } from "@/lib/api";

/**
 * Keeping the rider findable and trackable while the app is minimised.
 *
 * While a rider is on duty, Android runs a foreground service (with a visible
 * "on duty" notification) that keeps sending the position when the screen is
 * off or another app, such as a maps app, is in front. It starts when they go
 * on duty and stops the moment they go off duty or sign out; nothing is sent
 * off shift.
 *
 * The task is declared at module level and this file is imported from the root
 * layout, because Android may start the app headless just to run it.
 */
export const BACKGROUND_TASK = "reditoe-rider-location";
const ORDER_KEY = "rider.activeOrderId";

/** Which order the customer is following, so background fixes reach their map. */
export async function setActiveOrder(orderId: string | null) {
  try {
    if (orderId) await AsyncStorage.setItem(ORDER_KEY, orderId);
    else await AsyncStorage.removeItem(ORDER_KEY);
  } catch {
    // Not fatal: duty location still goes out.
  }
}

TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  const position = locations?.[locations.length - 1];
  if (!position) return;
  const { latitude, longitude, accuracy, heading, speed } = position.coords;

  await api.updateRiderLocation({ latitude, longitude }).catch(() => {});

  const orderId = await AsyncStorage.getItem(ORDER_KEY).catch(() => null);
  if (orderId) {
    await api
      .shareLocation(orderId, {
        latitude,
        longitude,
        accuracy: accuracy ?? undefined,
        heading: heading ?? undefined,
        speed: speed ?? undefined,
      })
      .catch(() => {});
  }
});

/** Prominent disclosure, then the system's "Allow all the time" step. */
async function ensureBackgroundPermission(): Promise<boolean> {
  const existing = await Location.getBackgroundPermissionsAsync();
  if (existing.status === "granted") return true;
  if (existing.canAskAgain === false) return false;

  const agreed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Keep your location on while on duty?",
      "Reditoe collects your location in the background while you are on duty, even when the app is closed or not in use, so you receive jobs near you and customers can follow their order on the map. A notification stays visible while this is on. It stops as soon as you go off duty or log out.\n\nOn the next screen choose “Allow all the time”.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
  if (!agreed) return false;
  return (await Location.requestBackgroundPermissionsAsync()).status === "granted";
}

/** Starts the background service. False if the rider declines; the app still works in the foreground. */
export async function startBackgroundLocation(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) return true;
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== "granted") return false;
    if (!(await ensureBackgroundPermission())) return false;

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Reditoe: you are on duty",
        notificationBody: "Sharing your location to get you nearby jobs. Go off duty to stop.",
        notificationColor: "#E23744",
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundLocation() {
  try {
    await setActiveOrder(null);
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    }
  } catch {
    // Already stopped.
  }
}
