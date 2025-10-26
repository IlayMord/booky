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

const isDefinedScheduleText = (text) => {
  const normalized = (text || "").trim();
  return Boolean(
    normalized && normalized !== "לא הוגדר" && normalized !== "-"
  );
};

const dedupeWeeklyHourRows = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row) {
      return false;
    }
    const signatureParts = [
      row.key ? String(row.key) : "",
      (row.label || "").trim(),
      (row.text || "").trim(),
    ];
    const signature = signatureParts.join("|");
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
};

export const buildWeeklyHoursRows = (weeklyHours) =>
  WEEK_DAYS.map((day, index) => {
    const schedule = weeklyHours?.[day.key];
    if (!schedule) {
      return { ...day, index, text: "לא הוגדר" };
    }

    if (schedule.closed) {
      return { ...day, index, text: "סגור" };
    }

    const open = typeof schedule.open === "string" ? schedule.open.trim() : "";
    const close =
      typeof schedule.close === "string" ? schedule.close.trim() : "";

    if (!open || !close) {
      return { ...day, index, text: "-" };
    }

    return { ...day, index, text: `${open} – ${close}` };
  });

export const summarizeWeeklyHoursRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const groups = [];

  rows.forEach((row, idx) => {
    if (!row) {
      return;
    }

    const normalizedText = (row.text || "").trim() || "-";
    const groupable = isDefinedScheduleText(normalizedText);
    const lastGroup = groups[groups.length - 1];
    const rowIndex = typeof row.index === "number" ? row.index : idx;

    if (
      lastGroup &&
      lastGroup.text === normalizedText &&
      lastGroup.groupable === groupable &&
      lastGroup.lastIndex === rowIndex - 1
    ) {
      lastGroup.lastIndex = rowIndex;
      lastGroup.days.push(row);
      return;
    }

    groups.push({
      text: normalizedText,
      groupable,
      firstIndex: rowIndex,
      lastIndex: rowIndex,
      days: [row],
    });
  });

  return groups.map((group) => {
    const days = group.days.filter(Boolean);
    if (!days.length) {
      return {
        key: String(group.firstIndex),
        label: "",
        text: group.text,
      };
    }

    const first = days[0];
    const last = days[days.length - 1];
    const label =
      days.length === 1 || !group.groupable
        ? first.label
        : `${first.label} – ${last.label}`;

    return {
      key: days.map((day) => day.key).join("-"),
      label,
      text: group.text,
    };
  });
};

export const getWeeklyHoursSummary = (weeklyHours) =>
  summarizeWeeklyHoursRows(buildWeeklyHoursRows(weeklyHours));

export const getDisplayWeeklyHoursRows = (weeklyHours) => {
  const summary = summarizeWeeklyHoursRows(buildWeeklyHoursRows(weeklyHours));
  const filtered = summary.filter((row) =>
    isDefinedScheduleText(row?.text) || row?.text === "סגור"
  );
  return dedupeWeeklyHourRows(filtered);
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
