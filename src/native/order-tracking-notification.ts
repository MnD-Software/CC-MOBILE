import { Platform } from "react-native";
import { getNativeNotifications } from "./notification-runtime";
import { orderActivityState } from "./order-activity-state";
import type { OrderActivitySnapshot } from "./order-activity-controller";

export const ANDROID_ORDER_TRACKING_CHANNEL = "order-tracking";

type PreparedNotification = {
  identifier: string;
  snapshot: OrderActivitySnapshot;
};

function notificationIdentifier(orderId: number) {
  return `cakecity-order-tracking-${orderId}`;
}

function formatUpdatedAt(checkedAt: number) {
  return new Date(checkedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prepare(snapshot: OrderActivitySnapshot): PreparedNotification | null {
  const state = orderActivityState(snapshot.status);
  if (
    !state ||
    state.terminal ||
    !Number.isSafeInteger(snapshot.id) ||
    snapshot.id < 1 ||
    !snapshot.number.trim() ||
    !Number.isFinite(snapshot.checkedAt)
  ) {
    return null;
  }
  return { identifier: notificationIdentifier(snapshot.id), snapshot };
}

async function ensureChannel() {
  const Notifications = getNativeNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(
    ANDROID_ORDER_TRACKING_CHANNEL,
    {
      name: "Order tracking",
      description: "Latest Cake City order status while you are tracking it",
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      showBadge: false,
    },
  );
}

async function ensurePermission() {
  const Notifications = getNativeNotifications();
  if (!Notifications) return;
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      "Notifications are disabled. Enable Cake City notifications in Android settings to track this order.",
    );
  }
}

async function present({ identifier, snapshot }: PreparedNotification) {
  const Notifications = getNativeNotifications();
  if (!Notifications) return null;
  const state = orderActivityState(snapshot.status);
  if (!state) return null;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `Cake City · Order ${snapshot.number}`,
      body: `${state.label} · Updated ${formatUpdatedAt(snapshot.checkedAt)}. Open Cake City for the latest.`,
      data: { cakeCityOrderTracking: true, orderId: snapshot.id },
      autoDismiss: false,
      color: "#EC008C",
      priority: Notifications.AndroidNotificationPriority.LOW,
      sound: false,
    },
    trigger: { channelId: ANDROID_ORDER_TRACKING_CHANNEL },
  });
  return identifier;
}

export function androidOrderTrackingAvailable() {
  return Platform.OS === "android" && !!getNativeNotifications();
}

export async function startAndroidOrderTracking(
  snapshot: OrderActivitySnapshot,
) {
  if (!androidOrderTrackingAvailable()) return null;
  const notification = prepare(snapshot);
  if (!notification) return null;
  // Android 13 shows its notification permission prompt only after a channel
  // exists, so create it before asking at this user-initiated moment.
  await ensureChannel();
  await ensurePermission();
  return present(notification);
}

export async function syncAndroidOrderTracking(
  identifier: string,
  snapshot: OrderActivitySnapshot,
) {
  if (!androidOrderTrackingAvailable()) return false;
  const notification = prepare(snapshot);
  if (!notification || notification.identifier !== identifier) {
    await stopAndroidOrderTracking(identifier);
    return false;
  }
  await present(notification);
  return true;
}

export async function stopAndroidOrderTracking(identifier: string) {
  if (!androidOrderTrackingAvailable()) return;
  const Notifications = getNativeNotifications();
  if (!Notifications) return;
  await Notifications.dismissNotificationAsync(identifier);
}
