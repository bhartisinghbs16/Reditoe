import { Alert, Linking } from "react-native";

/**
 * Dials a number, or says why it cannot.
 *
 * Several "Call customer" / "Call rider" buttons were drawn with no handler at
 * all, beside the very number they offered to ring. A number can also simply
 * be missing — an order placed before a phone was recorded — and saying so is
 * better than a button that appears to do nothing.
 */
export async function callNumber(raw?: string | null): Promise<void> {
  const digits = (raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) {
    Alert.alert("No number", "There is no phone number recorded for this contact.");
    return;
  }
  const url = `tel:${digits}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert("Can't dial", `This device cannot place calls. The number is ${raw}.`);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't dial", `Please call ${raw} from your phone.`);
  }
}
