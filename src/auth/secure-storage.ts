import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Platform-aware key/value storage.
 *
 * expo-secure-store ships an empty stub for web (`ExpoSecureStore.web.js` is
 * `export default {}`), so every SecureStore call throws on web. On web we
 * fall back to localStorage; native platforms keep using the real
 * Keychain/Keystore-backed SecureStore.
 */

const isWeb = Platform.OS === 'web';

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be unavailable (private mode / quota) - fail silently.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteStorageItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}