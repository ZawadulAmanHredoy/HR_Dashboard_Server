// Mentor applications: the review step between "Display on website" and a
// profile actually appearing there.
//
// is_published is the public switch and is now only ever flipped by an admin
// decision. A consultant asking to be listed moves application_status to
// 'pending'; approval sets it to 'approved' and publishes, rejection sets it
// to 'rejected' and leaves the profile hidden.
import { supabase } from "../lib/supabase.js";
import { adminRecipients } from "./roles.service.js";
import {
  sendMail,
  applicationReceivedEmail,
  applicationSubmittedAdminEmail,
  applicationApprovedEmail,
  applicationRejectedEmail,
} from "./mailer.service.js";

const TABLE = "profiles";

const APPLICATION_FIELDS = `
  id, full_name, email, role, designation, department, years_experience,
  avatar_url, price_per_session, currency, is_published,
  application_status, application_submitted_at, application_reviewed_at,
  application_reviewed_by, application_note
`;

function db() {
  if (!supabase) {
    throw Object.assign(new Error("Supabase is not configured"), { status: 503 });
  }
  return supabase;
}

export function toApplication(row) {
  return {
    id: row.id,
    name: row.full_name ?? "",
    email: row.email ?? "",
    role: row.role ?? "",
    designation: row.designation ?? "",
    department: row.department ?? "",
    yearsExperience: row.years_experience ?? null,
    avatarUrl: row.avatar_url ?? null,
    pricePerSession: row.price_per_session ?? null,
    currency: row.currency ?? "BDT",
    isPublished: row.is_published ?? false,
    status: row.application_status ?? "draft",
    submittedAt: row.application_submitted_at ?? null,
    reviewedAt: row.application_reviewed_at ?? null,
    reviewedBy: row.application_reviewed_by ?? null,
    note: row.application_note ?? "",
  };
}

/** Applications for the admin console, newest submission first. */
export async function listApplications(status) {
  let query = db().from(TABLE).select(APPLICATION_FIELDS);
  if (status && status !== "all") query = query.eq("application_status", status);

  const { data, error } = await query
    .order("application_submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw Object.assign(new Error(error.message), { status: 502 });

  return (data ?? []).map(toApplication);
}

async function loadRow(profileId) {
  const { data, error } = await db()
    .from(TABLE)
    .select(APPLICATION_FIELDS)
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { status: 502 });
  if (!data) throw Object.assign(new Error("Profile not found"), { status: 404 });
  return data;
}

async function applyChange(profileId, changes) {
  const { data, error } = await db()
    .from(TABLE)
    .update(changes)
    .eq("id", profileId)
    .select(APPLICATION_FIELDS)
    .single();
  if (error) throw Object.assign(new Error(error.message), { status: 502 });
  return data;
}

/**
 * A consultant asks to be listed. Publishing is NOT granted here — the profile
 * stays hidden until an admin approves. Mail is best-effort so a dead SMTP
 * server cannot lose the application itself.
 */
export async function submitApplication(profileId) {
  const row = await loadRow(profileId);
  if (row.application_status === "pending") return toApplication(row);

  const updated = await applyChange(profileId, {
    application_status: "pending",
    application_submitted_at: new Date().toISOString(),
    application_reviewed_at: null,
    application_reviewed_by: null,
    application_note: null,
    is_published: false,
  });

  await Promise.all([
    updated.email
      ? sendMail({ to: updated.email, ...applicationReceivedEmail(updated) })
      : Promise.resolve(false),
    ...(await adminRecipients()).map((to) =>
      sendMail({ to, ...applicationSubmittedAdminEmail(updated) }),
    ),
  ]).catch((err) => console.error("[applications] submit mail failed:", err.message));

  return toApplication(updated);
}

/** A consultant takes themselves back off the website. */
export async function withdrawApplication(profileId) {
  const updated = await applyChange(profileId, {
    application_status: "draft",
    is_published: false,
    application_submitted_at: null,
    application_reviewed_at: null,
    application_reviewed_by: null,
  });
  return toApplication(updated);
}

/** Admin decision. `approve` publishes; reject leaves the profile hidden. */
export async function reviewApplication(profileId, { approve, reviewer, note }) {
  const updated = await applyChange(profileId, {
    application_status: approve ? "approved" : "rejected",
    is_published: Boolean(approve),
    application_reviewed_at: new Date().toISOString(),
    application_reviewed_by: reviewer ?? null,
    application_note: note ?? null,
  });

  if (updated.email) {
    await sendMail({
      to: updated.email,
      ...(approve
        ? applicationApprovedEmail(updated)
        : applicationRejectedEmail(updated, note)),
    }).catch((err) =>
      console.error("[applications] decision mail failed:", err.message),
    );
  }

  return toApplication(updated);
}
