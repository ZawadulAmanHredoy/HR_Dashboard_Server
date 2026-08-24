/**
 * Seed rows shaped exactly like the Supabase tables in supabase/schema.sql.
 * Used by scripts/seed.js to populate a real project, and by the services as an
 * in-memory fallback when no Supabase credentials are configured.
 */

export const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Forhad Hossain",
  short_name: "Forhad H...",
  role: "Career Consultant",
  email: "forhad@aicvmaker.com",
  phone: "+880 1700 000000",
  timezone: "GMT+6",
  bio: "Career consultant helping candidates turn their experience into interview-winning CVs.",
  skills: ["CV Writing", "Interview Prep", "LinkedIn", "Career Switch"],
};

export const appointments = [
  { id: "a1", appointment_date: "2026-05-15", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Career", has_documents: true, status: "upcoming", mode: "Online" },
  { id: "a2", appointment_date: "2026-05-16", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Career", has_documents: true, status: "upcoming", mode: "Online" },
  { id: "a3", appointment_date: "2026-05-19", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Job", has_documents: false, status: "upcoming", mode: "In person" },
  { id: "a4", appointment_date: "2026-06-02", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Career", has_documents: true, status: "upcoming", mode: "Online" },
  { id: "a5", appointment_date: "2026-06-03", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Career", has_documents: true, status: "upcoming", mode: "Online" },
  { id: "a6", appointment_date: "2026-06-04", start_time: "09:00:00", end_time: "09:30:00", client_name: "Forhad Hossain", issue: "Career", has_documents: false, status: "upcoming", mode: "Online" },
  { id: "a7", appointment_date: "2026-06-11", start_time: "11:00:00", end_time: "11:30:00", client_name: "Nusrat Jahan", issue: "CV Review", has_documents: true, status: "upcoming", mode: "Online" },

  { id: "p1", appointment_date: "2026-04-21", start_time: "16:00:00", end_time: "16:30:00", client_name: "Tanvir Ahmed", issue: "Career", has_documents: true, status: "past", mode: "Online" },
  { id: "p2", appointment_date: "2026-04-22", start_time: "17:00:00", end_time: "17:30:00", client_name: "Sadia Islam", issue: "Interview", has_documents: false, status: "past", mode: "Online" },
  { id: "p3", appointment_date: "2026-05-02", start_time: "10:00:00", end_time: "10:30:00", client_name: "Rakib Hasan", issue: "CV Review", has_documents: true, status: "past", mode: "In person" },

  { id: "c1", appointment_date: "2026-05-08", start_time: "14:00:00", end_time: "14:30:00", client_name: "Mehedi Hasan", issue: "Job", has_documents: false, status: "cancelled", mode: "Online" },
  { id: "c2", appointment_date: "2026-05-12", start_time: "18:00:00", end_time: "18:30:00", client_name: "Ayesha Siddika", issue: "Career", has_documents: true, status: "cancelled", mode: "Online" },
];

export const clients = [
  { id: "c-1", name: "Nusrat Jahan", email: "nusrat.j@gmail.com", package: "Pro", sessions: 12, last_seen: "2026-05-12", status: "Active" },
  { id: "c-2", name: "Tanvir Ahmed", email: "tanvir.a@gmail.com", package: "Basic", sessions: 4, last_seen: "2026-04-21", status: "Active" },
  { id: "c-3", name: "Sadia Islam", email: "sadia.islam@outlook.com", package: "Enterprise", sessions: 27, last_seen: "2026-04-22", status: "Pending" },
  { id: "c-4", name: "Rakib Hasan", email: "rakib.hasan@gmail.com", package: "Pro", sessions: 9, last_seen: "2026-05-02", status: "Active" },
  { id: "c-5", name: "Mehedi Hasan", email: "mehedi@company.io", package: "Basic", sessions: 2, last_seen: "2026-05-08", status: "Closed" },
  { id: "c-6", name: "Ayesha Siddika", email: "ayesha.s@gmail.com", package: "Pro", sessions: 15, last_seen: "2026-05-12", status: "Active" },
];

/** Consult sessions surfaced in the availability side panel and waiting room. */
export const consultSessions = [
  { id: "s1", session_date: "2026-11-01", start_time: "09:30:00", end_time: "11:00:00", mode: "Online" },
  { id: "s2", session_date: "2026-11-01", start_time: "10:00:00", end_time: "11:00:00", mode: "Online" },
  { id: "s3", session_date: "2026-11-01", start_time: "10:00:00", end_time: "11:00:00", mode: "Online" },
  { id: "s4", session_date: "2026-11-02", start_time: "09:00:00", end_time: "11:00:00", mode: "Online" },
  { id: "s5", session_date: "2026-11-02", start_time: "10:00:00", end_time: "11:00:00", mode: "Online" },
  { id: "s6", session_date: "2026-11-02", start_time: "16:00:00", end_time: "18:00:00", mode: "Online" },
  { id: "s7", session_date: "2026-11-03", start_time: "11:00:00", end_time: "12:00:00", mode: "In person" },
  { id: "s8", session_date: "2026-11-03", start_time: "15:00:00", end_time: "16:30:00", mode: "Online" },
];

/** The month the availability screens are pinned to. */
export const AVAILABILITY_MONTH = { year: 2026, month: 11 }; // 1-indexed month

export const holidayDays = [8, 19, 26];

const SLOT_LIBRARY = [
  ["09:00:00", "10:00:00"],
  ["16:00:00", "17:00:00", "18:00:00"],
  ["09:00:00", "10:00:00", "11:00:00"],
  ["16:00:00", "17:00:00"],
  ["09:00:00"],
];

/** Deterministic slot distribution — same rule the original mock used. */
export function seedSlotsForDay(day) {
  if (holidayDays.includes(day) || day % 6 === 0) return [];
  return SLOT_LIBRARY[(day * 7) % SLOT_LIBRARY.length];
}

const pad = (n) => String(n).padStart(2, "0");

export const availabilitySlots = (() => {
  const { year, month } = AVAILABILITY_MONTH;
  const total = new Date(year, month, 0).getDate();
  const rows = [];
  for (let day = 1; day <= total; day++) {
    for (const start of seedSlotsForDay(day)) {
      rows.push({
        id: `slot-${year}-${pad(month)}-${pad(day)}-${start.slice(0, 2)}`,
        slot_date: `${year}-${pad(month)}-${pad(day)}`,
        start_time: start,
        duration_minutes: 60,
        mode: "Online",
      });
    }
  }
  return rows;
})();

export const holidays = holidayDays.map((day) => ({
  id: `holiday-${day}`,
  holiday_date: `${AVAILABILITY_MONTH.year}-${pad(AVAILABILITY_MONTH.month)}-${pad(day)}`,
  label: "Holiday",
}));

/** Headline metrics for the My Consults page (one row in `consult_metrics`). */
export const consultMetrics = {
  id: "22222222-2222-4222-8222-222222222222",
  total_consults: 148,
  hours_delivered: 96.5,
  avg_rating: 4.8,
  review_count: 132,
  repeat_rate: 62,
};
