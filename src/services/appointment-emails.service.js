// DB-facing side of booking emails: builds contexts from Supabase rows,
// sends the right template, and stamps appointments so restarts / cron ticks
// never double-send. All public functions are safe no-ops when SMTP or the
// database is not configured.
import { supabase } from "../lib/supabase.js";
import { hasMail } from "../config/env.js";
import {
  sendMail,
  bookingConfirmedEmail,
  appointmentCancelledEmail,
  appointmentRescheduledEmail,
  reminderEmail,
} from "./mailer.service.js";

const APPOINTMENT_SELECT = `
  id, status, mode, issue, note, attachments, client_user_id,
  starts_at, ends_at, confirmation_email_sent_at, meeting_link,
  users ( email ),
  profiles ( full_name, role, email, phone )
`;

/** Row + joined client email + consultant profile, or null. */
async function loadContext(appointmentId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  return toContext(data);
}

function toContext(row) {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    issue: row.issue,
    note: row.note,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    confirmationSentAt: row.confirmation_email_sent_at ?? null,
    meetingLink: row.meeting_link ?? null,
    clientName: row.client_name ?? null,
    clientEmail: row.users?.email ?? null,
    profiles: row.profiles ?? null,
  };
}

/** Same shape, for rows loaded outside this module (e.g. pre-delete). */
export const toEmailContext = toContext;

function ready(ctx) {
  return Boolean(supabase && hasMail && ctx?.clientEmail);
}

/**
 * Stamp helpers — the `.is(col, null)` guard makes the write a claim:
 * exactly one caller can set the stamp, so concurrent cron tick + instant
 * send cannot both report success. Returns true when this call won it.
 */
async function stampOnce(appointmentId, column) {
  const { data } = await supabase
    .from("appointments")
    .update({ [column]: new Date().toISOString() })
    .eq("id", appointmentId)
    .is(column, null)
    .select("id");
  return Boolean(data?.length);
}

/* ------------------------------------------------------- instant notifies */

/**
 * Booking confirmation for a registered client. Safe to call twice (from the
 * client-app webhook and the sweep): the stamp decides who actually counts.
 * Returns true if an email went out.
 */
export async function notifyBookingConfirmed(appointmentId) {
  const ctx = await loadContext(appointmentId);
  if (!ready(ctx) || ctx.status !== "upcoming") return false;
  if (ctx.confirmationSentAt) return false;

  const sent = await sendMail({ to: ctx.clientEmail, ...bookingConfirmedEmail(ctx) });
  if (sent) await stampOnce(ctx.id, "confirmation_email_sent_at");
  return sent;
}

/**
 * Consultant cancelled (status change or delete) — tell the registered client.
 * Pass preloadedCtx when the row is about to disappear (delete flow): after
 * the delete, loadContext can no longer find anything.
 */
export async function notifyAppointmentCancelled(appointmentId, preloadedCtx = null) {
  const ctx = preloadedCtx ?? (await loadContext(appointmentId));
  if (!ready(ctx)) return false;
  return sendMail({ to: ctx.clientEmail, ...appointmentCancelledEmail(ctx) });
}

/**
 * Consultant moved date/time — tell the registered client the new schedule.
 * Pass the previous schedule ({ startsAt, endsAt } ISO strings); when omitted
 * both lines show the current time rather than nothing useful.
 */
export async function notifyAppointmentRescheduled(appointmentId, previous = {}) {
  const ctx = await loadContext(appointmentId);
  if (!ready(ctx) || !ctx.startsAt) return false;
  const oldCtx = {
    ...ctx,
    startsAt: previous.startsAt ?? ctx.startsAt,
    endsAt: previous.endsAt ?? ctx.endsAt,
  };
  return sendMail({ to: ctx.clientEmail, ...appointmentRescheduledEmail(oldCtx, ctx) });
}

/* -------------------------------------------------------------- cron jobs */

/**
 * Confirmations that never got their instant email (client app offline,
 * internal secret unset, transient failure). Anything upcoming without a
 * stamp gets one within five minutes of this sweep running on its cron.
 */
export async function runConfirmationSweep() {
  if (!supabase || !hasMail) return 0;

  const { data: rows, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("status", "upcoming")
    .gt("starts_at", new Date().toISOString())
    .is("confirmation_email_sent_at", null)
    .order("starts_at")
    .limit(25);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const row of rows ?? []) {
    if (await notifyBookingConfirmed(row.id)) sent += 1;
  }
  return sent;
}

/**
 * Reminders. kind "24h" -> everything in the next day that has no 24h stamp;
 * kind "1h" -> the next hour. Neutral copy keeps late bookings sensible.
 */
export async function runReminderSweep(kind) {
  if (!supabase || !hasMail) return 0;

  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_1h_sent_at";
  const horizonMs = kind === "24h" ? 24 : 1;
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + horizonMs * 3_600_000).toISOString();

  const { data: rows, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("status", "upcoming")
    .gt("starts_at", nowIso)
    .lte("starts_at", horizonIso)
    .is(column, null)
    .order("starts_at")
    .limit(25);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const row of rows ?? []) {
    const ctx = toContext(row);
    if (!ready(ctx)) continue;
    // Stamp only on success: a transient SMTP outage retries next tick
    // instead of silently losing the reminder.
    const delivered = await sendMail({ to: ctx.clientEmail, ...reminderEmail(ctx, kind) });
    if (delivered) {
      await stampOnce(ctx.id, column);
      sent += 1;
    }
  }
  return sent;
}
