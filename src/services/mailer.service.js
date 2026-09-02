// Booking email templates + the SMTP transport. All sends are fire-and-forget:
// a mail failure must never break a booking, cancellation or cron sweep.
import nodemailer from "nodemailer";
import { env, hasMail } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mailHost,
      port: env.mailPort,
      secure: env.mailPort === 465,
      auth: { user: env.mailUser, pass: env.mailPass },
    });
  }
  return transporter;
}

export function isMailConfigured() {
  return hasMail;
}

export async function sendMail({ to, cc, subject, html, text }) {
  if (!hasMail || !to) return false;
  try {
    const from = env.mailFrom || env.mailUser;
    // `cc` arrives either as one address or as a list (the consultant plus any
    // guests invited on the booking). Normalise to an array and drop the
    // primary recipient so nobody is copied on their own mail.
    const primary = String(to).toLowerCase();
    const copies = (Array.isArray(cc) ? cc : cc ? [cc] : [])
      .filter((address) => typeof address === "string" && address.trim())
      .map((address) => address.trim())
      .filter((address) => address.toLowerCase() !== primary);

    const info = await getTransporter().sendMail({
      from: `"AI CV Maker" <${from}>`,
      to,
      ...(copies.length > 0 ? { cc: copies } : {}),
      subject,
      html,
      text: text ?? stripHtml(html),
    });
    console.log(`[mail] sent -> ${to}${copies.length > 0 ? ` (cc ${copies.join(", ")})` : ""} | ${subject} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[mail] FAILED -> ${to} | ${subject}:`, err.response ?? err.message);
    return false;
  }
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ format */

const dhakaFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** ISO instant -> "Tue, 25 Aug 2026, 5:30 pm" (Asia/Dhaka). */
export function formatDhaka(iso) {
  if (!iso) return "";
  return dhakaFormat.format(new Date(iso));
}

/* ----------------------------------------------------------------- layout */

function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0f766e;padding:18px 28px;color:#ffffff;font-size:17px;font-weight:600;">AI CV Maker</div>
    <div style="padding:26px 28px;">
      <h2 style="margin:0 0 14px;font-size:19px;color:#111827;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding:14px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">
      এই ইমেইলটি AI CV Maker বুকিং সিস্টেম থেকে স্বয়ংক্রিয়ভাবে পাঠানো।<br/>
      This is an automated message from the AI CV Maker booking system.
    </div>
  </div>
</body></html>`;
}

function sessionTable(rows) {
  const cells = rows
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-weight:600;">${value}</td>
      </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;margin:10px 0 4px;font-size:14px;">${cells}</table>`;
}

function paragraph(bn, en) {
  return (
    `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;">${bn}</p>` +
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">${en}</p>`
  );
}

/* -------------------------------------------------------------- templates */

/**
 * Every builder receives a context shaped like:
 * { clientName, startsAt, endsAt, mode, issue, note, attachments,
 *   profiles: { full_name, role, email, phone } }
 * and returns { subject, html }.
 */

function timeRange(ctx) {
  const start = formatDhaka(ctx.startsAt);
  const end = formatDhaka(ctx.endsAt).split(", ").pop();
  return `${start} – ${end} (Dhaka)`;
}

function sessionRows(ctx, extra = []) {
  return [
    ["Consultant", ctx.profiles?.full_name ?? "Consultant"],
    ["সময় / Time", timeRange(ctx)],
    ["ধরন / Mode", ctx.mode ?? "Online"],
    ...(ctx.meetingLink
      ? [
          [
            "Join link",
            `<a href="${escapeHtml(ctx.meetingLink)}" style="color:#0f766e;font-weight:700;">${escapeHtml(ctx.meetingLink)}</a>`,
          ],
        ]
      : []),
    ...extra,
  ];
}

function signature(profiles) {
  if (!profiles?.full_name) return "";
  const lines = [profiles.full_name, profiles.email, profiles.phone]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("");
  return `<p style="margin:16px 0 0;font-size:13px;color:#374151;">— ${lines}</p>`;
}

export function bookingConfirmedEmail(ctx) {
  const attachmentList = (ctx.attachments ?? [])
    .map((a) => a?.title)
    .filter(Boolean);
  const rows = sessionRows(ctx, [
    ["বিষয় / Topic", ctx.issue],
    ...(attachmentList.length
      ? [["সংযুক্ত CV", attachmentList.join(", ")]]
      : []),
  ]);
  return {
    subject: `Booking confirmed — ${ctx.profiles?.full_name ?? "session"} · ${formatDhaka(ctx.startsAt)}`,
    html: layout(
      "আপনার সেশন বুকিং নিশ্চিত হয়েছে / Booking confirmed",
      paragraph(
        `স্বাগতম ${escapeHtml(ctx.clientName)}! আপনার কনসালটেশন সেশনের বুকিং নিশ্চিত করা হয়েছে।`,
        `Hi ${escapeHtml(ctx.clientName)}, your consultation session is booked. Details below.`,
      ) + sessionTable(rows) + signature(ctx.profiles),
    ),
  };
}

export function appointmentCancelledEmail(ctx) {
  return {
    subject: `Session cancelled — ${formatDhaka(ctx.startsAt)}`,
    html: layout(
      "সেশন বাতিল করা হয়েছে / Session cancelled",
      paragraph(
        `দুঃখিত — ${formatDhaka(ctx.startsAt)} এর আপনার সেশনটি বাতিল করা হয়েছে। নতুন সময় বুক করতে ওয়েবসাইটে যান।`,
        `Your session on ${formatDhaka(ctx.startsAt)} has been cancelled by the consultant. You can book a new time anytime on the website.`,
      ) + sessionTable(sessionRows(ctx)),
    ),
  };
}

export function appointmentRescheduledEmail(oldCtx, newCtx) {
  return {
    subject: `Session rescheduled — now ${formatDhaka(newCtx.startsAt)}`,
    html: layout(
      "সেশনের সময় পরিবর্তন হয়েছে / Session rescheduled",
      paragraph(
        "আপনার সেশনের সময় পরিবর্তন করা হয়েছে। নতুন সময় নিচে দেওয়া হলো।",
        "The time of your session has changed. New schedule below.",
      ) +
        sessionTable([
          ["পূর্বের সময় / Old", `${formatDhaka(oldCtx.startsAt)} – ${formatDhaka(oldCtx.endsAt).split(", ").pop()}`],
          ...sessionRows(newCtx),
        ]) + signature(newCtx.profiles)
    ),
  };
}

export function reminderEmail(ctx, kind) {
  const bn =
    kind === "1h"
      ? "আপনার সেশন শুরু হতে আর এক ঘণ্টা বাকি!"
      : "আপনার সেশন খুব শীঘ্রই — প্রস্তুতি নিন!";
  const en =
    kind === "1h"
      ? "Your session starts in about an hour."
      : "An upcoming session of yours is scheduled for the time below.";
  return {
    subject: `Reminder: session ${kind === "1h" ? "in ~1 hour" : "coming up"} — ${formatDhaka(ctx.startsAt)}`,
    html: layout(
      "সেশন রিমাইন্ডার / Session reminder",
      paragraph(bn, en) + sessionTable(sessionRows(ctx)) + signature(ctx.profiles),
    ),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
