const AuthorizationStatus = {
  UNDETERMINED: "undetermined",
  GRANTED: "granted",
  DENIED: "denied",
};

const AndroidImportance = {
  DEFAULT: "default",
  HIGH: "high",
  LOW: "low",
  MIN: "min",
  NONE: "none",
};

const createDeniedResult = () => ({
  status: AuthorizationStatus.DENIED,
  granted: false,
  canAskAgain: false,
  expires: "never",
});

const noopAsync = async () => null;
const noop = () => {};

const fallbackNotifications = {
  __isFallback: true,
  AuthorizationStatus,
  AndroidImportance,
  setNotificationHandler: noop,
  getNotificationChannelAsync: noopAsync,
  setNotificationChannelAsync: noopAsync,
  getPermissionsAsync: async () => createDeniedResult(),
  requestPermissionsAsync: async () => createDeniedResult(),
  scheduleNotificationAsync: noopAsync,
  cancelScheduledNotificationAsync: noopAsync,
};

if (typeof console !== "undefined" && console.warn) {
  console.warn(
    "expo-notifications is not installed; falling back to a no-op implementation."
  );
}

module.exports = fallbackNotifications;
