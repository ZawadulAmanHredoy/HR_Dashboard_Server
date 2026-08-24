import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";
import { daysInMonth, formatTime, toISODate } from "../utils/format.js";

const SLOTS_TABLE = "availability_slots";
const HOLIDAYS_TABLE = "holidays";

const memorySlots = [...seed.availabilitySlots];
const memoryHolidays = [...seed.holidays];

function monthBounds(year, month) {
  return {
    start: toISODate(year, month, 1),
    end: toISODate(year, month, daysInMonth(year, month)),
  };
}

/**
 * Returns one entry per day of the month, each with its formatted slots and a
 * holiday flag — exactly what both availability views render.
 */
export async function getMonthAvailability(year, month, consultantId) {
  const { start, end } = monthBounds(year, month);
  let slotRows;
  let holidayRows;

  if (supabase) {
    const [slots, holidays] = await Promise.all([
      supabase
        .from(SLOTS_TABLE)
        .select("*")
        // Tenancy: only this consultant's availability.
        .eq("consultant_id", consultantId)
        .gte("slot_date", start)
        .lte("slot_date", end)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from(HOLIDAYS_TABLE)
        .select("*")
        .eq("consultant_id", consultantId)
        .gte("holiday_date", start)
        .lte("holiday_date", end),
    ]);
    if (slots.error) throw Object.assign(new Error(slots.error.message), { status: 502 });
    if (holidays.error) throw Object.assign(new Error(holidays.error.message), { status: 502 });
    slotRows = slots.data ?? [];
    holidayRows = holidays.data ?? [];
  } else {
    slotRows = memorySlots.filter((row) => row.slot_date >= start && row.slot_date <= end);
    holidayRows = memoryHolidays.filter(
      (row) => row.holiday_date >= start && row.holiday_date <= end,
    );
  }

  const holidayDays = new Set(holidayRows.map((row) => Number(row.holiday_date.slice(8, 10))));
  const total = daysInMonth(year, month);

  const days = Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const date = toISODate(year, month, day);
    const slots = slotRows
      .filter((row) => row.slot_date === date)
      .map((row) => ({
        id: row.id,
        start: formatTime(row.start_time),
        end: formatTime(addMinutes(row.start_time, row.duration_minutes ?? 60)),
        mode: row.mode ?? "Online",
      }));

    return { day, date, holiday: holidayDays.has(day), slots };
  });

  return { year, month, days, holidays: [...holidayDays].sort((a, b) => a - b) };
}

const MODES = ["Online", "In person"];
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Creates availability slots. Accepts several times at once and an optional
 * weekly repeat so HR can lay out a whole month in one click. Duplicate
 * (date + time) rows already in the table are silently skipped.
 */
export async function createSlots({
  date,
  times,
  duration_minutes = 60,
  mode = "Online",
  repeat_weeks = 0,
  consultantId,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    throw Object.assign(new Error("date must be an ISO date (YYYY-MM-DD)"), { status: 400 });
  }
  if (!Array.isArray(times) || times.length === 0 || times.length > 12) {
    throw Object.assign(new Error("times must be a non-empty array (max 12)"), { status: 400 });
  }
  const normalized = times.map((time) => {
    const match = TIME_RE.exec(String(time).trim());
    if (!match) throw Object.assign(new Error(`invalid time: ${time}`), { status: 400 });
    return `${match[1].padStart(2, "0")}:${match[2]}:00`;
  });
  const duration = Number(duration_minutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
    throw Object.assign(new Error("duration_minutes must be 15-240"), { status: 400 });
  }
  if (!MODES.includes(mode)) {
    throw Object.assign(new Error(`mode must be one of ${MODES.join(", ")}`), { status: 400 });
  }
  const weeks = Number(repeat_weeks);
  if (!Number.isInteger(weeks) || weeks < 0 || weeks > 12) {
    throw Object.assign(new Error("repeat_weeks must be 0-12"), { status: 400 });
  }

  // Expand date × week × time, skipping combos that already exist.
  const base = new Date(`${date}T00:00:00Z`);
  const wanted = new Map();
  for (let week = 0; week <= weeks; week += 1) {
    const day = new Date(base.getTime() + week * 7 * 86400000);
    const iso = day.toISOString().slice(0, 10);
    // Key at HH:MM precision so it lines up with the DB rows being compared.
    for (const start of normalized) wanted.set(`${iso} ${start.slice(0, 5)}`, { slot_date: iso, start_time: start });
  }

  let existingKeys = new Set();
  if (supabase) {
    const dates = [...new Set([...wanted.values()].map((row) => row.slot_date))];
    const { data: existingRows, error } = await supabase
      .from(SLOTS_TABLE)
      .select("slot_date, start_time")
      .eq("consultant_id", consultantId)
      .in("slot_date", dates);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
    existingKeys = new Set((existingRows ?? []).map((row) => `${row.slot_date} ${row.start_time.slice(0, 5)}`));
  } else {
    existingKeys = new Set(memorySlots.map((row) => `${row.slot_date} ${row.start_time.slice(0, 5)}`));
  }

  const rows = [...wanted.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => ({
      ...row,
      duration_minutes: duration,
      mode,
      consultant_id: consultantId ?? null,
    }));

  if (rows.length === 0) return { created: 0, skipped: wanted.size };

  if (supabase) {
    // A concurrent request may have inserted the same slot between our check
    // and this write — count those as skipped instead of failing.
    const { error } = await supabase.from(SLOTS_TABLE).insert(rows);
    if (error) {
      if (/duplicate key/i.test(error.message ?? "")) {
        return { created: 0, skipped: wanted.size };
      }
      throw Object.assign(new Error(error.message), { status: 502 });
    }
  } else {
    memorySlots.push(...rows.map((row, index) => ({ id: `slot-new-${Date.now()}-${index}`, ...row })));
  }

  return { created: rows.length, skipped: wanted.size - rows.length };
}

/** Removes a slot — refused while an active booking still points at it. */
export async function deleteSlot(id, consultantId) {
  if (supabase) {
    // Ownership first: another consultant's slot reads as "not found".
    const { data: owned, error: ownedError } = await supabase
      .from(SLOTS_TABLE)
      .select("id")
      .eq("id", id)
      .eq("consultant_id", consultantId)
      .maybeSingle();
    if (ownedError) throw Object.assign(new Error(ownedError.message), { status: 502 });
    if (!owned) throw Object.assign(new Error("Slot not found"), { status: 404 });

    const { data: booked, error: bookedError } = await supabase
      .from("appointments")
      .select("id")
      .eq("slot_id", id)
      .neq("status", "cancelled")
      .limit(1);
    if (bookedError) throw Object.assign(new Error(bookedError.message), { status: 502 });
    if (booked && booked.length > 0) {
      throw Object.assign(
        new Error("This slot has an active booking. Cancel the session first."),
        { status: 409 },
      );
    }

    const { error } = await supabase
      .from(SLOTS_TABLE)
      .delete()
      .eq("id", id)
      .eq("consultant_id", consultantId);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
  } else {
    const index = memorySlots.findIndex((row) => row.id === id);
    if (index !== -1) memorySlots.splice(index, 1);
  }
  return { id };
}

export async function toggleHoliday(date, consultantId) {
  if (supabase) {
    const { data, error } = await supabase
      .from(HOLIDAYS_TABLE)
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("holiday_date", date)
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { status: 502 });

    if (data) {
      const { error: deleteError } = await supabase
        .from(HOLIDAYS_TABLE)
        .delete()
        .eq("id", data.id)
        .eq("consultant_id", consultantId);
      if (deleteError) throw Object.assign(new Error(deleteError.message), { status: 502 });
      return { date, holiday: false };
    }

    // Guard: don't strand clients by holiday-ing a day with live bookings.
    const { data: booked, error: bookedError } = await supabase
      .from("appointments")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .limit(1);
    if (bookedError) throw Object.assign(new Error(bookedError.message), { status: 502 });
    if (booked && booked.length > 0) {
      throw Object.assign(
        new Error("This day already has bookings. Cancel or move them first."),
        { status: 409 },
      );
    }

    const { error: insertError } = await supabase
      .from(HOLIDAYS_TABLE)
      .insert({ holiday_date: date, label: "Holiday", consultant_id: consultantId });
    if (insertError) throw Object.assign(new Error(insertError.message), { status: 502 });
    return { date, holiday: true };
  }

  const index = memoryHolidays.findIndex((row) => row.holiday_date === date);
  if (index === -1) {
    memoryHolidays.push({ id: `holiday-${date}`, holiday_date: date, label: "Holiday" });
    return { date, holiday: true };
  }
  memoryHolidays.splice(index, 1);
  return { date, holiday: false };
}

function addMinutes(time, minutes) {
  const [hour, minute] = String(time).split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}:00`;
}
