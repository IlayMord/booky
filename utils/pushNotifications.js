import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  formatBookingDateForDisplay,
  normaliseBookingTime,
  resolveBookingDateTime,
} from "./bookingDate";

let NotificationsModule;
try {
  // Dynamic require so the bundle can load even if expo-notifications is not installed.
  // eslint-disable-next-line global-require
  NotificationsModule = require("expo-notifications");
} catch (error) {
  console.warn(
    "expo-notifications module is not available; push reminders will be disabled.",
    error
  );
}

const Notifications = NotificationsModule;
const hasNativeNotificationsSupport =
  !!Notifications && Notifications.__isFallback !== true;

const STORAGE_KEY = "@booky_appointment_notifications";
const ANDROID_CHANNEL_ID = "booky-reminders";

if (hasNativeNotificationsSupport && Notifications?.setNotificationHandler) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const ensureAndroidChannelAsync = async () => {
  if (!hasNativeNotificationsSupport || !Notifications?.getNotificationChannelAsync) {
    return;
  }

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
  if (
    !hasNativeNotificationsSupport ||
    !Notifications?.getPermissionsAsync ||
    !Notifications?.requestPermissionsAsync
  ) {
    return false;
  }

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
  if (!hasNativeNotificationsSupport || !Notifications?.cancelScheduledNotificationAsync) {
    return;
  }

  const tasks = ids.map((id) => Notifications.cancelScheduledNotificationAsync(id));
  await Promise.allSettled(tasks);
};

const scheduleReminderAsync = async (booking, triggerDate, reminderType) => {
  if (!hasNativeNotificationsSupport || !Notifications?.scheduleNotificationAsync) {
    return null;
  }

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

  if (!hasNativeNotificationsSupport) {
    if (Object.values(stored).flat().length) {
      await persistStoredNotificationsAsync({});
    }
    return;
  }

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
      if (id) {
        reminderIds.push(id);
      }
    }

    const hourBefore = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
    if (hourBefore.getTime() > now) {
      const id = await scheduleReminderAsync(booking, hourBefore, "hourBefore");
      if (id) {
        reminderIds.push(id);
      }
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
