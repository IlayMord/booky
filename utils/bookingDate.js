const DATE_KEY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_REGEX = /(\d{2}:\d{2})/;

export const formatDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
};

export const formatDateLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export const parseDateKey = (value) => {
  if (typeof value !== "string") return null;
  const match = value.match(DATE_KEY_REGEX);
  if (!match) return null;
  const [, year, month, day] = match;
  const result = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(result.getTime()) ? null : result;
};

export const normaliseBookingDate = (value) => {
  if (!value) return "";
  if (DATE_KEY_REGEX.test(value)) {
    return value;
  }

  const cleaned = String(value).replace(/[\.]/g, "/");
  const parts = cleaned.split("/");
  if (parts.length === 3) {
    const [day, month, yearPart] = parts.map((part) => part.trim());
    if (day && month && yearPart) {
      const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
      return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateKey(parsed);
  }

  return "";
};

export const normaliseBookingTime = (value) => {
  if (!value) return "";
  const match = String(value).match(TIME_REGEX);
  return match ? match[1] : "";
};

export const formatBookingDateForDisplay = (value) => {
  const normalised = normaliseBookingDate(value);
  if (!normalised) return value || "";
  const date = parseDateKey(normalised);
  return date ? formatDateLabel(date) : value || "";
};

export const resolveBookingDateTime = (booking) => {
  if (!booking) return null;
  const dateKey = normaliseBookingDate(booking.date);
  const timeKey = normaliseBookingTime(booking.time);
  if (!dateKey || !timeKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = timeKey.split(":").map(Number);
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
};

export const isBookingTimeElapsed = (booking, reference = Date.now()) => {
  const date = resolveBookingDateTime(booking);
  if (!date) return false;
  const referenceTime =
    reference instanceof Date ? reference.getTime() : Number(reference);
  if (!Number.isFinite(referenceTime)) {
    return date.getTime() <= Date.now();
  }
  return date.getTime() <= referenceTime;
};

export const formatTimeForDisplay = normaliseBookingTime;

export const getHoursUntilBooking = (booking, reference = Date.now()) => {
  const date = resolveBookingDateTime(booking);
  if (!date) return null;
  const referenceTime =
    reference instanceof Date ? reference.getTime() : Number(reference);
  if (!Number.isFinite(referenceTime)) {
    return (date.getTime() - Date.now()) / (1000 * 60 * 60);
  }
  return (date.getTime() - referenceTime) / (1000 * 60 * 60);
};
