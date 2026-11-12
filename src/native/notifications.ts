import { Platform } from "react-native";
import { getNativeNotifications } from "./notification-runtime";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { api } from "@/api/client";
import type { Href } from "expo-router";
import { getStorageItem } from "@/auth/secure-storage";
export function notificationRoute(data: Record<string, unknown>): Href | null {
  if (data.workspace === "rider") return "/rider";
  if (
    typeof data.reference === "string" &&
    /^APP-[A-Za-z0-9-]{1,46}$/.test(data.reference)
  )
    return {
      pathname: "/order/[reference]",
      params: { reference: data.reference },
    };
  const orderId =
    data.cakeCityOrderTracking === true ? Number(data.orderId) : Number.NaN;
  if (Number.isSafeInteger(orderId) && orderId > 0)
    return {
      pathname: "/order/[reference]",
      params: { reference: `website-${orderId}` },
    };
  if (
    typeof data.reference === "string" &&
    /^CC-[A-Za-z0-9-]+$/.test(data.reference)
  )
    return {
      pathname: "/order/[reference]",
      params: { reference: data.reference },
    };
  const url = typeof data.url === "string" ? data.url : "";
  const match = url.match(/^\/account\/orders\/(CC-[A-Za-z0-9-]+)$/);
  if (match)
    return { pathname: "/order/[reference]", params: { reference: match[1] } };
  const routes: Record<string, Href> = {
    "/requests": "/requests",
    "/notifications": "/notifications",
    "/account/rewards": "/rewards",
    "/account/moments": "/moments",
    "/offers": "/offers",
    "/checkout": "/cart",
  };
  return Object.hasOwn(routes, url) ? routes[url] : null;
}
export async function registerNotifications(prompt = true) {
  if (Platform.OS === "web" || isRunningInExpoGo())
    throw new Error(
      "Push notifications are available in the installed Cake City app.",
    );
  const Notifications = getNativeNotifications();
  if (!Notifications)
    throw new Error(
      "Push notifications are available in the installed Cake City app.",
    );
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Orders and delivery",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("offers", {
      name: "Offers and rewards",
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && prompt && permission.canAskAgain)
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  if (
    !permission.granted &&
    permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    throw new Error(
      "Notifications are disabled. You can enable them in your device settings.",
    );
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error("Notifications cannot be registered at the moment.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const refreshToken = await getStorageItem("cakecity.refresh-token");
  if (!refreshToken) throw new Error("Sign in again to enable notifications.");
  await api.post(
    "/v1/account/notifications/devices",
    {
      token,
      platform: Platform.OS,
      provider: "expo",
      refresh_token: refreshToken,
    },
    { auth: true },
  );
  return token;
}
