import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  formatBookingDateForDisplay,
  normaliseBookingTime,
  resolveBookingDateTime,
} from "./bookingDate";

const STORAGE_KEY = "@booky_appointment_notifications";
const ANDROID_CHANNEL_ID = "booky-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const ensureAndroidChannelAsync = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  const existing = await Notifications.getNotificationChannelAsync(
    ANDROID_CHANNEL_ID
  );
  if (existing) {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "תזכורות לתורים",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
};

const ensurePushPermissionsAsync = async () => {
  const settings = await Notifications.getPermissionsAsync();
  let finalStatus = settings.status;

  if (settings.status !== Notifications.AuthorizationStatus.GRANTED) {
    const request = await Notifications.requestPermissionsAsync();
    finalStatus = request.status;
  }

  if (finalStatus !== Notifications.AuthorizationStatus.GRANTED) {
    return false;
  }

  await ensureAndroidChannelAsync();
  return true;
};

const readStoredNotificationsAsync = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to read stored notifications", error);
  }
  return {};
};

const persistStoredNotificationsAsync = async (mapping) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch (error) {
    console.warn("Failed to persist notifications state", error);
  }
};

const cancelNotificationIdsAsync = async (ids = []) => {
  const tasks = ids.map((id) => Notifications.cancelScheduledNotificationAsync(id));
  await Promise.allSettled(tasks);
};

const scheduleReminderAsync = async (booking, triggerDate, reminderType) => {
  const displayDate = formatBookingDateForDisplay(booking.date);
  const displayTime = normaliseBookingTime(booking.time) || "";
  const timeSegment = displayTime ? ` בשעה ${displayTime}` : "";
  const dateSegment = displayDate ? ` (${displayDate})` : "";
  const businessName = booking.businessName || "העסק";
  const title = "תזכורת לתור";

  const body =
    reminderType === "dayBefore"
      ? `מחר${dateSegment} יש לך תור אצל ${businessName}${timeSegment}.`
      : `התור שלך אצל ${businessName} יתחיל בעוד שעה${
          displayTime ? ` (${displayTime})` : ""
        }.`;

  const trigger = Platform.select({
    android: {
      channelId: ANDROID_CHANNEL_ID,
      date: triggerDate,
    },
    default: triggerDate,
  });

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        appointmentId: booking.id,
        reminderType,
      },
    },
    trigger,
  });
};

export const syncAppointmentNotifications = async (
  bookings = [],
  { enabled = true } = {}
) => {
  const stored = await readStoredNotificationsAsync();

  if (!enabled) {
    const allIds = Object.values(stored).flat();
    if (allIds.length) {
      await cancelNotificationIdsAsync(allIds);
    }
    await persistStoredNotificationsAsync({});
    return;
  }

  const hasPermission = await ensurePushPermissionsAsync();
  if (!hasPermission) {
    const allIds = Object.values(stored).flat();
    if (allIds.length) {
      await cancelNotificationIdsAsync(allIds);
    }
    await persistStoredNotificationsAsync({});
    return;
  }

  const now = Date.now();
  const updatedMapping = {};

  for (const booking of bookings) {
    if (!booking?.id) continue;

    const appointmentDate = resolveBookingDateTime(booking);
    if (!appointmentDate) {
      if (stored[booking.id]?.length) {
        await cancelNotificationIdsAsync(stored[booking.id]);
      }
      continue;
    }

    const normalizedStatus =
      typeof booking.status === "string"
        ? booking.status.toLowerCase()
        : "";
    if (
      normalizedStatus.includes("cancel") ||
      normalizedStatus.includes("decline") ||
      normalizedStatus.includes("reject") ||
      normalizedStatus.includes("complete")
    ) {
      if (stored[booking.id]?.length) {
        await cancelNotificationIdsAsync(stored[booking.id]);
      }
      continue;
    }

    if (appointmentDate.getTime() <= now) {
      if (stored[booking.id]?.length) {
        await cancelNotificationIdsAsync(stored[booking.id]);
      }
      continue;
    }

    if (stored[booking.id]?.length) {
      await cancelNotificationIdsAsync(stored[booking.id]);
    }

    const reminderIds = [];

    const dayBefore = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
    if (dayBefore.getTime() > now) {
      const id = await scheduleReminderAsync(booking, dayBefore, "dayBefore");
      reminderIds.push(id);
    }

    const hourBefore = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
    if (hourBefore.getTime() > now) {
      const id = await scheduleReminderAsync(booking, hourBefore, "hourBefore");
      reminderIds.push(id);
    }

    if (reminderIds.length) {
      updatedMapping[booking.id] = reminderIds;
    }
  }

  for (const [bookingId, ids] of Object.entries(stored)) {
    if (!updatedMapping[bookingId]) {
      await cancelNotificationIdsAsync(ids);
    }
  }

  await persistStoredNotificationsAsync(updatedMapping);
};
