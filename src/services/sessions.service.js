import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";
import {
  dayDiff,
  formatLongDate,
  formatTime,
  toISODate,
  weekdayLabel,
} from "../utils/format.js";

/**
 * Upcoming sessions come from the consultant's OWN appointments.
 *
 * This used to read the shared `consult_sessions` demo table, which has no
 * consultant column — so every HR saw the same rows regardless of who booked
 * them. Deriving from `appointments` keeps the panel scoped and real.
 */

/** Demo mode only: the seed data is pinned to a fixed month. */
export const REFERENCE_DATE = toISODate(
  seed.AVAILABILITY_MONTH.year,
  seed.AVAILABILITY_MONTH.month,
  1,
);

function todayISO() {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function groupLabel(date, reference) {
  const diff = dayDiff(reference, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return weekdayLabel(date);
}

export async function listUpcomingSessions(consultantId) {
  if (supabase) {
    const from = todayISO();
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, start_time, end_time, mode, client_name, status")
      .eq("consultant_id", consultantId)
      .eq("status", "upcoming")
      .gte("appointment_date", from)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(25);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });

    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.mode,
      start: formatTime(row.start_time),
      end: formatTime(row.end_time),
      dateLabel: formatLongDate(row.appointment_date),
      group: groupLabel(row.appointment_date, from),
      client: row.client_name,
    }));
  }

  // Demo mode: single identity, so the seeded rows cannot leak between users.
  return [...seed.consultSessions]
    .sort(
      (a, b) =>
        a.session_date.localeCompare(b.session_date) ||
        a.start_time.localeCompare(b.start_time),
    )
    .map((row) => ({
      id: row.id,
      label: row.mode,
      start: formatTime(row.start_time),
      end: formatTime(row.end_time),
      dateLabel: formatLongDate(row.session_date),
      group: groupLabel(row.session_date, REFERENCE_DATE),
      client: null,
    }));
}
