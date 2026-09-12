import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
// Native tokens live in Keychain/Keystore. Browser review uses memory only.
const browserSession = new Map<string, string>();
export async function setStorageItem(key: string, value: string) {
  if (Platform.OS === "web") {
    browserSession.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function getStorageItem(key: string) {
  if (Platform.OS === "web") {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* old insecure session migration */
    }
    return browserSession.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}
export async function deleteStorageItem(key: string) {
  if (Platform.OS === "web") {
    browserSession.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
