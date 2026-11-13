import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Where the sign-in token and other secrets are kept on the phone.
 *
 * AsyncStorage is a plain file other tools can read on a rooted phone or from
 * a backup. SecureStore keeps the value in the Android Keystore instead. On
 * the web there is no keystore, so the old storage is used there unchanged.
 *
 * A session saved by an earlier version lives in AsyncStorage; the first read
 * moves it across, so nobody is signed out by the update.
 */
const native = Platform.OS !== "web";

export async function getSecureItem(key: string): Promise<string | null> {
  if (!native) return AsyncStorage.getItem(key);
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value != null) return value;
  } catch {
    // Fall through to the legacy copy.
  }
  const legacy = await AsyncStorage.getItem(key);
  if (legacy != null) {
    try {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    } catch {
      // Keep the legacy copy; try again next launch.
    }
  }
  return legacy;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (!native) return AsyncStorage.setItem(key, value);
  try {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key).catch(() => {});
  } catch {
    // The keystore refused; better a working session than none.
    await AsyncStorage.setItem(key, value);
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  if (native) await SecureStore.deleteItemAsync(key).catch(() => {});
  await AsyncStorage.removeItem(key).catch(() => {});
}
