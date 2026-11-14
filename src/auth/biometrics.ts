import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import { getStorageItem, setStorageItem } from "./secure-storage";
const listeners = new Set<() => void>();
const unlocked = new Map<string, number>();
const key = (owner: string) => `cakecity.biometric-unlock.v1.${owner}`;
export async function unlockDevice(owner: string) {
  if (Platform.OS === "web")
    throw Error(
      "Face ID and fingerprints are available in the installed mobile app.",
    );
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (
    Platform.OS === "ios" &&
    Constants.appOwnership === "expo" &&
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  )
    throw Error(
      "Face ID needs the installed Cake City app or a development build. Sign in with your password in Expo Go.",
    );
  if (
    !(await LocalAuthentication.hasHardwareAsync()) ||
    !(await LocalAuthentication.isEnrolledAsync())
  )
    throw Error(
      "Set up Face ID or a fingerprint in your phone settings first.",
    );
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Cake City",
    cancelLabel: "Use account password",
    fallbackLabel: "Use phone passcode",
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
  });
  if (!result.success)
    throw Error(
      "Unlock was not completed. Retry or sign in with your account password.",
    );
  unlocked.set(owner, Date.now());
}
export async function disableBiometricUnlock(owner: string) {
  await setStorageItem(key(owner), "0");
  for (const listener of listeners) listener();
}
export const recentlyUnlocked = (owner: string) =>
  Date.now() - (unlocked.get(owner) || 0) < 15000;
export function useBiometricPreference(owner?: string) {
  const [enabled, setValue] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    const read = () => {
      if (!owner) {
        setValue(false);
        setReady(true);
        return;
      }
      void getStorageItem(key(owner))
        .then((value) => {
          if (alive) {
            setValue(value === "1");
            setReady(true);
          }
        })
        .catch(() => {
          if (alive) setReady(true);
        });
    };
    read();
    listeners.add(read);
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, [owner]);
  return {
    enabled,
    ready,
    setEnabled: async (value: boolean) => {
      if (!owner) throw Error("Sign in first.");
      await unlockDevice(owner);
      await setStorageItem(key(owner), value ? "1" : "0");
      for (const listener of listeners) listener();
    },
  };
}
