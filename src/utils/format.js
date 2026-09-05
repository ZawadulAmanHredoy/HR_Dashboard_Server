const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n) => String(n).padStart(2, "0");

/** "09:00:00" -> "09:00am", "16:00:00" -> "04:00pm" */
export function formatTime(value) {
  if (!value) return "";
  const [hourRaw, minute = "00"] = String(value).split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${pad(display)}:${minute.slice(0, 2)}${suffix}`;
}

/** "2026-05-15" -> { year: 2026, month: 4, day: 15 } (month is 0-indexed for the UI) */
export function splitDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return { year, month: month - 1, day };
}

/** "2026-11-01" -> "Nov 01, 2026" */
export function formatLongDate(value) {
  const { year, month, day } = splitDate(value);
  return `${MONTHS_SHORT[month]} ${pad(day)}, ${year}`;
}

export function toISODate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Today's local "YYYY-MM-DD". */
export function todayISO() {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Difference in whole days between two ISO dates. */
export function dayDiff(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function weekdayLabel(value) {
  const { year, month, day } = splitDate(value);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(year, month, day).getDay()
  ];
  return `${weekday}, ${MONTHS_SHORT[month]} ${pad(day)}`;
}
