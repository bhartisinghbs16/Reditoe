import { Alert } from "react-native";
import * as Location from "expo-location";

/**
 * Asks for location the way Google Play requires: a plain explanation first,
 * in the app, and the phone's own permission box only if the person agrees.
 *
 * Returns true when the app may read the position. If permission is already
 * granted nothing is shown; if the person says "Not now", the system box is
 * never raised and false comes back, so they can carry on without it.
 */
export async function requestLocationWithDisclosure(): Promise<boolean> {
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.status === "granted") return true;
  if (existing.canAskAgain === false) return false;

  const agreed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Use your location?",
      "Reditoe uses your location while you are on duty, to offer you delivery jobs near you and to show customers where their order is.\n\nYour location is used only while the app is open, and only for this purpose. You can change this any time in your phone's settings.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
  if (!agreed) return false;

  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.status === "granted";
}
