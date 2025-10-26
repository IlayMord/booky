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

const normalizeClosedFlag = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
  }

  return Boolean(value);
};

export const sanitizeWeeklyHours = (value) => {
  const base = createEmptyWeeklyHours();
  if (!value || typeof value !== "object") {
    return base;
  }

  WEEK_DAYS.forEach((day) => {
    const existing = value[day.key];
    if (existing && typeof existing === "object") {
      const open =
        typeof existing.open === "string" ? existing.open.trim() : "";
      const close =
        typeof existing.close === "string" ? existing.close.trim() : "";

      base[day.key] = {
        open,
        close,
        closed: normalizeClosedFlag(existing.closed),
      };
    }
  });

  return base;
};

export const getWeekdayKeyFromDate = (dateInput) => {
  if (!dateInput) return null;

  let date = dateInput;
  if (typeof dateInput === "string") {
    const isoMatch = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    } else {
      date = new Date(dateInput);
    }
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return WEEKDAY_KEY_BY_INDEX[date.getDay()] ?? null;
};
