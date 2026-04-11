const MINUTES_PER_DAY = 24 * 60;

const WORKING_SCHEDULES = {
  fittings: {
    weekdays: [1, 2, 3, 4, 5],
    windows: [[6 * 60, 22 * 60]],
  },
  pipes: {
    weekdays: [1, 2, 3, 4, 5],
    windows: [[5 * 60 + 30, 22 * 60 + 30]],
  },
  spools: {
    weekdays: [1, 2, 3, 4, 5],
    windows: [[7 * 60 + 15, 16 * 60]],
  },
};

const normalizeDepartment = (value) => String(value || "").trim().toLowerCase();

const includesAny = (value, tokens) => tokens.some((token) => value.includes(token));

const inferDepartmentFromMachine = (value) => {
  const machine = String(value || "").trim().toUpperCase();
  if (machine.startsWith("BH")) return "fittings";
  if (machine.startsWith("BA")) return "pipes";
  if (machine.startsWith("BM")) return "spools";
  return "";
};

const resolveScheduleKey = (context = {}) => {
  const explicit = normalizeDepartment(context.department);
  if (explicit.includes("fitting")) return "fittings";
  if (includesAny(explicit, ["pipe", "pijp"])) return "pipes";
  if (includesAny(explicit, ["spool"])) return "spools";

  const inferred = inferDepartmentFromMachine(context.machine || context.station || context.originMachine);
  if (inferred === "fittings") return "fittings";
  if (inferred === "pipes") return "pipes";
  if (inferred === "spools") return "spools";

  return "";
};

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const minutesBetween = (start, end) => Math.max(0, (end.getTime() - start.getTime()) / 60000);

export const calculateWorkingMinutes = (startValue, endValue, context = {}) => {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || end <= start) return 0;

  const scheduleKey = resolveScheduleKey(context);
  const schedule = WORKING_SCHEDULES[scheduleKey];
  if (!schedule) {
    return Math.floor(minutesBetween(start, end));
  }

  let totalMinutes = 0;
  let cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < end) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayOfWeek = dayStart.getDay();
    if (schedule.weekdays.includes(dayOfWeek)) {
      schedule.windows.forEach(([startMinute, endMinute]) => {
        const windowStart = new Date(dayStart.getTime() + startMinute * 60000);
        const windowEnd = new Date(dayStart.getTime() + Math.min(endMinute, MINUTES_PER_DAY) * 60000);

        const effectiveStart = windowStart > start ? windowStart : start;
        const effectiveEnd = windowEnd < end ? windowEnd : end;

        if (effectiveEnd > effectiveStart) {
          totalMinutes += minutesBetween(effectiveStart, effectiveEnd);
        }
      });
    }

    cursor = dayEnd;
  }

  return Math.floor(totalMinutes);
};
