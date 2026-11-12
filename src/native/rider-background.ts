import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "@/api/client";
import { env } from "@/config/env";
import { getStorageItem } from "@/auth/secure-storage";

const TASK = "cakecity-active-delivery-location";
const KEY = "cakecity.rider-location-grant";
type Grant = { taskId: string; token: string; expires_at: string };
let flight = Promise.resolve();
async function sendLocation(init: RequestInit, timeout: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(env.apiUrl + "/v1/rider/tracking/location", {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
async function read(): Promise<Grant | null> {
  if (Platform.OS === "web") return null;
  const value = await SecureStore.getItemAsync(KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as Grant;
  } catch {
    return null;
  }
}
export async function backgroundTrip() {
  const grant = await read();
  if (!grant) return null;
  if (
    Date.now() >= Date.parse(grant.expires_at) ||
    !(await Location.hasStartedLocationUpdatesAsync(TASK))
  ) {
    await stopBackgroundSharing(grant.token);
    return null;
  }
  return grant.taskId;
}
export async function stopBackgroundSharing(expectedToken?: string) {
  if (Platform.OS === "web") return;
  const grant = await read();
  if (expectedToken && grant?.token !== expectedToken) return;
  await SecureStore.deleteItemAsync(KEY);
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
  if (grant)
    await sendLocation(
      {
        method: "DELETE",
        headers: { Authorization: "Bearer " + grant.token },
      },
      10000,
    ).catch(() => undefined);
}
export async function startBackgroundSharing(taskId: string) {
  if (Platform.OS === "web" || !(await TaskManager.isAvailableAsync()))
    throw new Error("Background sharing requires the installed Cake City app.");
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted)
    throw new Error("Allow location access before sharing a delivery.");
  const permission = await Location.requestBackgroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Choose Always allow in location settings to keep sharing while navigating.",
    );
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("Turn on location services first.");
  const refresh = await getStorageItem("cakecity.refresh-token");
  if (!refresh) throw new Error("Sign in again before sharing location.");
  await stopBackgroundSharing();
  const grant = await api.post<{ token: string; expires_at: string }>(
    `/v1/rider/tasks/${encodeURIComponent(taskId)}/tracking-session`,
    { refresh_token: refresh },
    { auth: true },
  );
  await SecureStore.setItemAsync(KEY, JSON.stringify({ ...grant, taskId }), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      deferredUpdatesInterval: 5000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Cake City delivery location",
        notificationBody:
          "Sharing location for your active delivery. Stop sharing in the rider screen.",
        killServiceOnDestroy: true,
      },
    });
  } catch (error) {
    await stopBackgroundSharing();
    throw error;
  }
}
if (Platform.OS !== "web" && !TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const fix = [...data.locations].sort(
        (a, b) => b.timestamp - a.timestamp,
      )[0];
      flight = flight
        .catch(() => undefined)
        .then(async () => {
          const grant = await read();
          if (!grant) {
            if (await Location.hasStartedLocationUpdatesAsync(TASK))
              await Location.stopLocationUpdatesAsync(TASK);
            return;
          }
          if (Date.now() >= Date.parse(grant.expires_at)) {
            await stopBackgroundSharing(grant.token);
            return;
          }
          if (
            fix.coords.accuracy == null ||
            fix.coords.accuracy > 200 ||
            Date.now() - fix.timestamp > 120000
          )
            return;
          const response = await sendLocation(
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + grant.token,
              },
              body: JSON.stringify({
                latitude: fix.coords.latitude,
                longitude: fix.coords.longitude,
                accuracy: fix.coords.accuracy,
                recorded_at: new Date(fix.timestamp).toISOString(),
              }),
            },
            15000,
          );
          if ([401, 403, 404, 409].includes(response.status))
            await stopBackgroundSharing(grant.token);
        });
      return flight;
    },
  );
