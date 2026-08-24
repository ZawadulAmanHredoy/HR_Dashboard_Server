import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";
import { toISODate } from "../utils/format.js";

/**
 * Stat tiles are computed from the consultant's OWN appointments.
 *
 * They used to come from `consult_metrics`, a single shared row — so every HR
 * saw the same (and somebody else's) numbers.
 */

function seededTiles(row) {
  return [
    { label: "Total consults", value: String(row.total_consults), delta: "+12% this month" },
    { label: "Hours delivered", value: String(row.hours_delivered), delta: "+8% this month" },
    { label: "Avg. rating", value: String(row.avg_rating), delta: `from ${row.review_count} reviews` },
    { label: "Repeat clients", value: `${row.repeat_rate}%`, delta: "+4% this month" },
  ];
}

function minutesBetween(start, end) {
  const toMinutes = (value) => {
    const [hour, minute] = String(value).split(":").map(Number);
    return hour * 60 + minute;
  };
  const span = toMinutes(end) - toMinutes(start);
  return span > 0 ? span : 0;
}

export async function getConsultStats(consultantId) {
  if (!supabase) return seededTiles(seed.consultMetrics);

  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date, start_time, end_time, status, client_user_id, client_name")
    .eq("consultant_id", consultantId);
  if (error) throw Object.assign(new Error(error.message), { status: 502 });

  const rows = (data ?? []).filter((row) => row.status !== "cancelled");
  const now = new Date();
  const today = toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const monthPrefix = today.slice(0, 7);

  const thisMonth = rows.filter((row) => row.appointment_date.startsWith(monthPrefix));
  const completed = rows.filter(
    (row) => row.status === "past" || row.appointment_date < today,
  );

  const minutes = completed.reduce(
    (total, row) => total + minutesBetween(row.start_time, row.end_time),
    0,
  );

  const perClient = new Map();
  for (const row of rows) {
    const key = row.client_user_id ?? `name:${row.client_name}`;
    perClient.set(key, (perClient.get(key) ?? 0) + 1);
  }
  const returning = [...perClient.values()].filter((count) => count > 1).length;
  const repeatRate = perClient.size
    ? Math.round((returning / perClient.size) * 100)
    : 0;

  return [
    {
      label: "Total consults",
      value: String(rows.length),
      delta: `${thisMonth.length} this month`,
    },
    {
      label: "Hours delivered",
      value: (minutes / 60).toFixed(1),
      delta: `${completed.length} session${completed.length === 1 ? "" : "s"} completed`,
    },
    {
      // No reviews table yet — show nothing rather than somebody else's rating.
      label: "Avg. rating",
      value: "—",
      delta: "no reviews yet",
    },
    {
      label: "Repeat clients",
      value: `${repeatRate}%`,
      delta: `${returning} returning`,
    },
  ];
}
