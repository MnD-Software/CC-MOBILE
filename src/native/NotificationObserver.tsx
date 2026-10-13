import { useEffect, useRef } from "react";
import { router } from "expo-router";
import type * as NotificationTypes from "expo-notifications";
import { getNativeNotifications } from "./notification-runtime";
import { useAuth } from "@/auth/AuthProvider";
import { notificationRoute } from "./notifications";

const Notifications = getNativeNotifications();
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const tracking =
        notification.request.content.data?.cakeCityOrderTracking === true;
      return {
        shouldPlaySound: !tracking,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: tracking
          ? Notifications.AndroidNotificationPriority.LOW
          : Notifications.AndroidNotificationPriority.DEFAULT,
      };
    },
  });
}

export function NotificationObserver() {
  const { customer, restoring } = useAuth();
  const handledResponse = useRef<string | null>(null);
  useEffect(() => {
    const Notifications = getNativeNotifications();
    if (!Notifications || restoring || !customer) return;
    let active = true;
    const handle = (response: NotificationTypes.NotificationResponse) => {
      if (!active) return;
      const identity = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (handledResponse.current === identity) return;
      handledResponse.current = identity;
      const path = notificationRoute(
        response.notification.request.content.data ?? {},
      );
      if (path) router.push(path);
      void Notifications.clearLastNotificationResponseAsync().catch(
        () => undefined,
      );
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r) handle(r);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => {
      active = false;
      sub.remove();
    };
  }, [customer?.id, restoring]);
  return null;
}
