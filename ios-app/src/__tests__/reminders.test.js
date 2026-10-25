import * as Notifications from "expo-notifications";
import { cancelReminder, enableReminder, scheduleReminder } from "../reminders";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("id"),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

beforeEach(() => jest.clearAllMocks());

describe("scheduleReminder", () => {
  it("replaces any existing reminder with a single daily one", async () => {
    await scheduleReminder(7);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: "daily",
      hour: 7,
      minute: 0,
    });
  });
});

describe("enableReminder", () => {
  it("schedules without prompting when permission is already granted", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    await expect(enableReminder(12)).resolves.toEqual({ ok: true });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("asks for permission, then schedules when the user accepts", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ granted: true });
    await expect(enableReminder(18)).resolves.toEqual({ ok: true });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("does not schedule when the user declines", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(enableReminder(7)).resolves.toEqual({ ok: false });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not prompt again after a previous denial", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(enableReminder(7)).resolves.toEqual({ ok: false });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("cancelReminder", () => {
  it("clears scheduled notifications", async () => {
    await cancelReminder();
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});
