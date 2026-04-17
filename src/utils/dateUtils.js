export const toDateSafe = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  if (typeof value?.toMillis === "function") {
    const millis = value.toMillis();
    if (Number.isFinite(millis)) {
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const seconds = value?.seconds ?? value?._seconds;
  if (typeof seconds === "number") {
    const nanoseconds = value?.nanoseconds ?? value?._nanoseconds ?? 0;
    const millis = seconds * 1000 + Math.floor(Number(nanoseconds) / 1000000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTimeSafe = (
  value,
  locale = "nl-NL",
  options = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  fallback = "-"
) => {
  const date = toDateSafe(value);
  return date ? date.toLocaleString(locale, options) : fallback;
};