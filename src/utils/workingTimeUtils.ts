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

type ScheduleKey = keyof typeof WORKING_SCHEDULES;

const normalizeDepartment = (value: unknown): string => String(value || "").trim().toLowerCase();

const includesAny = (value: string, tokens: string[]): boolean => tokens.some((token) => value.includes(token));

const inferDepartmentFromMachine = (value: unknown): ScheduleKey | "" => {
  const machine = String(value || "").trim().toUpperCase();
  if (machine.startsWith("BH")) return "fittings";
  if (machine.startsWith("BA")) return "pipes";
  if (machine.startsWith("BM")) return "spools";
  return "";
};

const easterSunday = (year: number): Date => {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const dateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const dutchHolidayKeys = (year: number): Set<string> => {
  const easter = easterSunday(year);
  const kingDay = new Date(year, 3, 27); // 27 april, behalve zondag -> 26 april
  if (kingDay.getDay() === 0) kingDay.setDate(26);

  const holidays = [
    new Date(year, 0, 1), // Nieuwjaarsdag
    kingDay, // Koningsdag
    new Date(year, 4, 5), // Bevrijdingsdag
    addDays(easter, 1), // 2e Paasdag
    addDays(easter, 39), // Hemelvaart
    addDays(easter, 50), // 2e Pinksterdag
    new Date(year, 11, 25), // 1e Kerstdag
    new Date(year, 11, 26), // 2e Kerstdag
  ];

  return new Set(holidays.map(dateKey));
};

const resolveScheduleKey = (context: Record<string, unknown> = {}): ScheduleKey | "" => {
  const phase = normalizeDepartment(context.phase || context.step || context.currentStep);
  if (includesAny(phase, ["nabewer", "post"])) return "spools";

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

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return ((value as { toDate: () => Date }).toDate());
  }
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const minutesBetween = (start: Date, end: Date): number =>
  Math.max(0, (end.getTime() - start.getTime()) / 60000);

export const calculateWorkingMinutes = (
  startValue: unknown,
  endValue: unknown,
  context: Record<string, unknown> = {}
): number => {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || end <= start) return 0;

  const scheduleKey = resolveScheduleKey(context);
  if (!scheduleKey) {
    return Math.floor(minutesBetween(start, end));
  }
  const schedule = WORKING_SCHEDULES[scheduleKey];

  let totalMinutes = 0;
  let currentHolidayYear = NaN;
  let holidaySet = new Set<string>();
  let cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < end) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    if (dayStart.getFullYear() !== currentHolidayYear) {
      currentHolidayYear = dayStart.getFullYear();
      holidaySet = dutchHolidayKeys(currentHolidayYear);
    }

    const dayOfWeek = dayStart.getDay();
    const isHoliday = holidaySet.has(dateKey(dayStart));
    if (schedule.weekdays.includes(dayOfWeek) && !isHoliday) {
      schedule.windows.forEach(([startMinute, endMinute]: number[]) => {
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
