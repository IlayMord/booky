export const WEEK_DAYS = [
  { key: "sunday", label: "יום ראשון", shortLabel: "א׳" },
  { key: "monday", label: "יום שני", shortLabel: "ב׳" },
  { key: "tuesday", label: "יום שלישי", shortLabel: "ג׳" },
  { key: "wednesday", label: "יום רביעי", shortLabel: "ד׳" },
  { key: "thursday", label: "יום חמישי", shortLabel: "ה׳" },
  { key: "friday", label: "יום שישי", shortLabel: "ו׳" },
  { key: "saturday", label: "יום שבת", shortLabel: "ש׳" },
];

const WEEKDAY_KEY_BY_INDEX = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const createEmptyWeeklyHours = () =>
  WEEK_DAYS.reduce((acc, day) => {
    acc[day.key] = { open: "", close: "", closed: false };
    return acc;
  }, {});

export const sanitizeWeeklyHours = (value) => {
  const base = createEmptyWeeklyHours();
  if (!value || typeof value !== "object") {
    return base;
  }

  WEEK_DAYS.forEach((day) => {
    const existing = value[day.key];
    if (existing && typeof existing === "object") {
      base[day.key] = {
        open: typeof existing.open === "string" ? existing.open : "",
        close: typeof existing.close === "string" ? existing.close : "",
        closed: Boolean(existing.closed),
      };
    }
  });

  return base;
};

export const getWeekdayKeyFromDate = (dateInput) => {
  if (!dateInput) return null;
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return WEEKDAY_KEY_BY_INDEX[date.getDay()] ?? null;
};
