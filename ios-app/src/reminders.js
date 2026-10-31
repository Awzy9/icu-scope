import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Local (on-device) notifications only: no push server or APNs entitlement involved.
export const remindersSupported = Platform.OS === "ios" || Platform.OS === "android";

export const REMINDER_HOURS = [
  { value: 7, label: "7:00" },
  { value: 12, label: "12:00" },
  { value: 18, label: "18:00" },
];

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Replaces any existing reminder, so there is never more than one.
export async function scheduleReminder(hour) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: "ICU Scope", body: "Today's critical-care literature is ready to read." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
  });
}

export const cancelReminder = () => Notifications.cancelAllScheduledNotificationsAsync();

// Asks for permission if needed, then schedules. Returns { ok: false } when the user has declined.
export async function enableReminder(hour) {
  let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  if (!granted && canAskAgain) {
    ({ granted } = await Notifications.requestPermissionsAsync());
  }
  if (!granted) return { ok: false };
  await scheduleReminder(hour);
  return { ok: true };
}
