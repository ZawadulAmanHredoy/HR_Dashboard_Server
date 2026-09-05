import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";
import { formatTime, splitDate, toISODate, daysInMonth } from "../utils/format.js";

/** A booking date + start/end time as the real instant (Dhaka, +06:00). */
function dhakaInstant(date, time) {
  return new Date(`${date}T${String(time ?? "").slice(0, 8)}+06:00`).toISOString();
}
import {
  notifyBookingConfirmed,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
  toEmailContext,
} from "./appointment-emails.service.js";
import { ensureMeetingLink } from "./meet.service.js";

/** Create the Meet link first (when eligible), then send the confirmation. */
function confirmWithMeetLink(appointmentId) {
  void (async () => {
    try {
      await ensureMeetingLink(appointmentId);
    } catch (err) {
      console.error("[meet] ensure failed:", err.message);
    }
    await notifyBookingConfirmed(appointmentId);
  })();
}

const TABLE = "appointments";

/** In-memory copy so the API stays writable without a Supabase project. */
const memory = [...seed.appointments];

/** DB row -> the shape the React screens render. */
function toApi(row) {
  const { year, month, day } = splitDate(row.appointment_date);
  return {
    id: row.id,
    date: row.appointment_date,
    year,
    month,
    day,
    start: formatTime(row.start_time),
    end: formatTime(row.end_time),
    client: row.client_name,
    // Present when the booking came from a registered client (client app).
    clientEmail: row.client_email ?? null,
    registered: Boolean(row.client_user_id),
    attachments: row.attachments ?? [],
    issue: row.issue,
    documents: Boolean(row.has_documents) || (row.attachments?.length ?? 0) > 0,
    status: row.status,
    mode: row.mode,
    note: row.note ?? null,
    meetingLink: row.meeting_link ?? null,
  };
}

function sortRows(rows) {
  return [...rows].sort(
    (a, b) =>
      a.appointment_date.localeCompare(b.appointment_date) ||
      a.start_time.localeCompare(b.start_time),
  );
}

export async function listAppointments({ status, fromMonth, year, consultantId } = {}) {
  const nowIso = new Date().toISOString();
  // Expire check: an appointment is "upcoming" only while its start instant is
  // still in the future, so today's 10:30 meeting drops out at 10:31.
  const instant = (row) => dhakaInstant(row.appointment_date, row.start_time);

  let rows;

  if (supabase) {
    // Tenancy: a consultant only ever sees their own bookings.
    let query = supabase.from(TABLE).select("*").eq("consultant_id", consultantId);
    if (status === "upcoming" || status === "past") {
      // The upcoming/past split is purely time-based; both come from the same
      // status pool so the DB only narrows by the month/consultant.
      query = query.in("status", ["upcoming", "past"]);
    } else if (status) {
      query = query.eq("status", status);
    }
    if (year && fromMonth) {
      const first = toISODate(year, fromMonth, 1);
      const last = toISODate(year, fromMonth, daysInMonth(year, fromMonth));
      query = query.gte("appointment_date", first).lte("appointment_date", last);
    }
    const { data, error } = await query
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
    const fetched = data ?? [];
    if (status === "past") {
      rows = fetched
        .filter(
          (row) =>
            row.status === "past" ||
            (row.status === "upcoming" && instant(row) < nowIso),
        )
        // A session that already happened has no usable call link left.
        .map((row) => ({ ...row, meeting_link: null }));
    } else if (status === "upcoming") {
      rows = fetched.filter(
        (row) => row.status === "upcoming" && instant(row) >= nowIso,
      );
    } else {
      rows = fetched;
    }
    rows = await withClientEmails(rows);
  } else {
    rows = sortRows(memory).filter((row) => {
      if (status === "upcoming") {
        if (row.status !== "upcoming") return false;
        if (instant(row) < nowIso) return false;
      } else if (status === "past") {
        const expired =
          row.status === "past" || (row.status === "upcoming" && instant(row) < nowIso);
        if (!expired) return false;
      } else if (status === "cancelled") {
        if (row.status !== "cancelled") return false;
      }
      if (year && fromMonth) {
        const first = toISODate(year, fromMonth, 1);
        const last = toISODate(year, fromMonth, daysInMonth(year, fromMonth));
        return row.appointment_date >= first && row.appointment_date <= last;
      }
      return true;
    });
    if (status === "past") {
      // Past sessions are not joinable, drop any link that was generated
      // while the appointment was still upcoming.
      rows = rows.map((row) => ({ ...row, meeting_link: null }));
    }
  }

  return rows.map(toApi);
}

/** Attach the registered client's email to rows booked from the client app. */
async function withClientEmails(rows) {
  const ids = [...new Set(rows.map((row) => row.client_user_id).filter(Boolean))];
  if (ids.length === 0) return rows;

  if (supabase) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email")
      .in("id", ids);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
    const emailById = new Map((data ?? []).map((u) => [u.id, u.email]));
    return rows.map((row) => ({
      ...row,
      client_email: row.client_user_id
        ? (emailById.get(row.client_user_id) ?? null)
        : null,
    }));
  }
  return rows;
}

export async function createAppointment(payload) {
  const row = {
    id: randomUUID(),
    appointment_date: payload.date,
    start_time: payload.startTime,
    end_time: payload.endTime,
    client_name: payload.client,
    issue: payload.issue,
    has_documents: Boolean(payload.documents),
    status: payload.status ?? "upcoming",
    mode: payload.mode ?? "Online",
    note: payload.note ?? null,
    consultant_id: payload.consultantId ?? null,
    // Computed server-side so Meet links don't depend on a DB trigger existing.
    starts_at: dhakaInstant(payload.date, payload.startTime),
    ends_at: dhakaInstant(payload.date, payload.endTime),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select()
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
    // Registered client (booked or imported with a user link): confirm now.
    confirmWithMeetLink(data.id);
    return toApi(data);
  }

  memory.push(row);
  return toApi(row);
}

export async function updateAppointment(id, patch, consultantId) {
  const changes = {};
  if (patch.date !== undefined) changes.appointment_date = patch.date;
  if (patch.startTime !== undefined) changes.start_time = patch.startTime;
  if (patch.endTime !== undefined) changes.end_time = patch.endTime;
  if (patch.client !== undefined) changes.client_name = patch.client;
  if (patch.issue !== undefined) changes.issue = patch.issue;
  if (patch.documents !== undefined) changes.has_documents = patch.documents;
  if (patch.status !== undefined) changes.status = patch.status;
  if (patch.mode !== undefined) changes.mode = patch.mode;
  if (patch.note !== undefined) changes.note = patch.note;

  if (supabase) {
    // Pre-update row first: change detection (cancel / reschedule emails)
    // and the slot-detach rule both need the original state.
    const { data: old } = await supabase
      .from(TABLE)
      .select("id, status, appointment_date, start_time, end_time, slot_id")
      .eq("id", id)
      // Tenancy: another consultant's booking reads as "not found", never editable.
      .eq("consultant_id", consultantId)
      .maybeSingle();
    if (!old) throw Object.assign(new Error("Appointment not found"), { status: 404 });

    // Rescheduling a client booking by date/time detaches it from its claimed
    // availability slot: the slot frees up for others and the appointment
    // keeps the custom times. The starts_at/ends_at trigger recomputes.
    if (
      (changes.appointment_date || changes.start_time || changes.end_time) &&
      !("slot_id" in changes)
    ) {
      if (old.slot_id) changes.slot_id = null;
    }

    // Keep starts_at/ends_at in step with the (possibly new) date and times
    // rather than trusting a DB trigger to recompute them.
    if (
      changes.appointment_date !== undefined ||
      changes.start_time !== undefined ||
      changes.end_time !== undefined
    ) {
      changes.starts_at = dhakaInstant(
        changes.appointment_date ?? old.appointment_date,
        changes.start_time ?? old.start_time,
      );
      changes.ends_at = dhakaInstant(
        changes.appointment_date ?? old.appointment_date,
        changes.end_time ?? old.end_time,
      );
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(changes)
      .eq("id", id)
      .eq("consultant_id", consultantId)
      .select()
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 502 });

    void detectChangeAndNotify(old, data);
    // Switching a session to Online mid-life also needs its Meet link.
    if (changes.mode === "Online") {
      void ensureMeetingLink(data.id).catch((err) =>
        console.error("[meet] ensure failed:", err.message),
      );
    }
    return toApi(data);
  }

  const row = memory.find((item) => item.id === id);
  if (!row) throw Object.assign(new Error("Appointment not found"), { status: 404 });
  Object.assign(row, changes);
  return toApi(row);
}

export async function deleteAppointment(id, consultantId) {
  if (supabase) {
    // Full context BEFORE deleting — the email needs data that is gone after.
    // Scoped read doubles as the ownership check.
    const { data: oldRow } = await supabase
      .from(TABLE)
      .select("*, users(email), profiles(full_name, role, email, phone)")
      .eq("id", id)
      .eq("consultant_id", consultantId)
      .maybeSingle();
    if (!oldRow) throw Object.assign(new Error("Appointment not found"), { status: 404 });

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("consultant_id", consultantId);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });

    // Deleting an upcoming booking is a cancellation from the client's view.
    if (oldRow?.status === "upcoming") {
      void notifyAppointmentCancelled(id, toEmailContext(oldRow));
    }
    return { id };
  }

  const index = memory.findIndex((item) => item.id === id);
  if (index === -1) throw Object.assign(new Error("Appointment not found"), { status: 404 });
  memory.splice(index, 1);
  return { id };
}

/** Fire-and-forget: turn an HR edit into the right client email. */
async function detectChangeAndNotify(old, updated) {
  try {
    const timeChanged =
      old.appointment_date !== updated.appointment_date ||
      old.start_time !== updated.start_time ||
      old.end_time !== updated.end_time;

    if (old.status === "upcoming" && updated.status === "cancelled") {
      await notifyAppointmentCancelled(updated.id);
    } else if (
      old.status === "upcoming" &&
      updated.status === "upcoming" &&
      timeChanged
    ) {
      const dhakaInstant = (date, time) =>
        new Date(`${date}T${String(time).slice(0, 8)}+06:00`).toISOString();
      await notifyAppointmentRescheduled(updated.id, {
        startsAt: dhakaInstant(old.appointment_date, old.start_time),
        endsAt: dhakaInstant(old.appointment_date, old.end_time),
      });
    }
  } catch (err) {
    console.error("[mail] change notification failed:", err.message);
  }
}
