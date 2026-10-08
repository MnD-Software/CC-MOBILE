import { useEffect } from "react";
import { Platform } from "react-native";
import { getNativeNotifications } from "./notification-runtime";
import { useAuth } from "@/auth/AuthProvider";
import { celebrationReminderDate } from "@/features/account/reminder-date";

const prefix = "cakecity-calendar:";
let activeOwner: string | null = null;
const identifier = (owner: string, id: string) => `${prefix}${owner}:${id}`;

export function CelebrationReminderPrivacy() {
  const { customer, restoring } = useAuth();
  useEffect(() => {
    if (restoring) return;
    activeOwner = customer?.id ?? null;
    const Notifications = getNativeNotifications();
    if (!Notifications) return;
    void Notifications.getAllScheduledNotificationsAsync()
      .then(async (requests) => {
        for (const request of requests) {
          if (
            request.identifier.startsWith(prefix) &&
            (!activeOwner ||
              !request.identifier.startsWith(`${prefix}${activeOwner}:`))
          ) {
            await Notifications.cancelScheduledNotificationAsync(
              request.identifier,
            );
          }
        }
      })
      .catch(() => undefined);
  }, [customer?.id, restoring]);
  return null;
}

export async function scheduleCelebrationReminder(
  owner: string,
  event: { id: string; month: number; day: number },
) {
  const Notifications = getNativeNotifications();
  if (!Notifications)
    throw new Error("Reminders are available in the installed app.");
  if (activeOwner !== owner)
    throw new Error("Sign in again before setting a reminder.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("celebrations", {
      name: "Celebration reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Enable notifications in your device settings to use reminders.",
    );
  if (activeOwner !== owner)
    throw new Error("Account changed. Please try again.");
  const id = identifier(owner, event.id);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (
    !scheduled.some((request) => request.identifier === id) &&
    scheduled.filter((request) => request.identifier.startsWith(prefix))
      .length >= 32
  )
    throw new Error(
      "This device supports up to 32 saved celebration reminders.",
    );
  const date = celebrationReminderDate(event.month, event.day);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: "A celebration is coming up",
      body: "Open your Cake City calendar and plan something special.",
      data: { url: "/account/moments" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: "celebrations",
    },
  });
  if (activeOwner !== owner) {
    await Notifications.cancelScheduledNotificationAsync(id);
    throw new Error("Account changed. Reminder was cancelled.");
  }
  return date;
}

export async function cancelCelebrationReminder(owner: string, id: string) {
  const Notifications = getNativeNotifications();
  if (Notifications)
    await Notifications.cancelScheduledNotificationAsync(identifier(owner, id));
}
