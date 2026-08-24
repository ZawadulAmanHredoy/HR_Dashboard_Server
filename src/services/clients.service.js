import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";
import { formatLongDate, toISODate } from "../utils/format.js";

/**
 * A client is somebody who booked THIS consultant.
 *
 * Booking facts (sessions, last consult, next appointment, issue, attached CVs)
 * are derived from `appointments` — never copied. Consultant-authored details
 * (phone, address, job title, age, status, note) live in `client_records`, one
 * row per consultant + client, created lazily on first edit.
 */

const RECORDS_TABLE = "client_records";

function todayISO() {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Registered clients key on their account id; manual ones on their name. */
function clientKey(row) {
  return row.client_user_id ?? `name:${row.client_name}`;
}

/** Folds a consultant's appointments into one entry per client. */
function foldAppointments(rows) {
  const today = todayISO();
  const byClient = new Map();

  for (const row of rows) {
    const key = clientKey(row);
    const entry = byClient.get(key) ?? {
      key,
      clientUserId: row.client_user_id ?? null,
      name: row.client_name,
      sessions: 0,
      lastConsult: null,
      nextAppointment: null,
      issue: null,
      latestDate: null,
      bookingNote: null,
      attachments: [],
      hasUpcoming: false,
    };

    if (row.status !== "cancelled") {
      entry.sessions += 1;

      if (row.appointment_date <= today) {
        if (!entry.lastConsult || row.appointment_date > entry.lastConsult) {
          entry.lastConsult = row.appointment_date;
        }
      } else {
        entry.hasUpcoming = true;
        if (!entry.nextAppointment || row.appointment_date < entry.nextAppointment) {
          entry.nextAppointment = row.appointment_date;
        }
      }
    }

    // Latest appointment wins for both "issue" and the client's booking note.
    if (!entry.latestDate || row.appointment_date > entry.latestDate) {
      entry.latestDate = row.appointment_date;
      entry.issue = row.issue;
      entry.bookingNote = row.note ?? "";
    }

    // Attachments are either saved CVs ({ cv_id, title }) or files uploaded
    // during booking ({ type: "resume", title, storage_path }). Dedup on
    // whichever identifier each carries.
    for (const attachment of row.attachments ?? []) {
      const id = attachment.cv_id ?? attachment.storage_path;
      if (!id) continue;
      if (!entry.attachments.some((a) => (a.cv_id ?? a.storage_path) === id)) {
        entry.attachments.push(attachment);
      }
    }

    byClient.set(key, entry);
  }

  return byClient;
}

function derivedStatus(entry) {
  if (entry.hasUpcoming) return "Stable";
  return entry.sessions > 0 ? "Follow-up" : "Closed";
}

/** Derived + stored, with stored winning wherever the consultant typed something. */
function merge(entry, record, account) {
  return {
    id: entry.key,
    name: record?.full_name || account?.name || entry.name,
    email: record?.email || account?.email || "",
    phone: record?.phone || account?.phone || "",
    address: record?.address ?? "",
    jobTitle: record?.job_title ?? "",
    age: record?.age ?? null,
    code: record?.code ?? null,
    package: account?.plan ?? "Guest",
    registered: Boolean(entry.clientUserId),
    sessions: entry.sessions,
    issue: entry.issue ?? "",
    lastConsult: entry.lastConsult,
    nextAppointment: entry.nextAppointment,
    lastSeen: entry.lastConsult ? formatLongDate(entry.lastConsult) : "",
    status: record?.status || derivedStatus(entry),
    note: record?.note ?? "",
    bookingNote: entry.bookingNote ?? "",
    avatarUrl: account?.avatar_url ?? "",
    attachments: entry.attachments,
  };
}

/** Loads accounts + stored records for a set of folded clients. */
async function loadSideData(consultantId, entries) {
  const userIds = [...new Set(entries.map((e) => e.clientUserId).filter(Boolean))];

  const [accounts, records] = await Promise.all([
    userIds.length
      ? supabase.from("users").select("id, email, name, plan, phone, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
    supabase.from(RECORDS_TABLE).select("*").eq("consultant_id", consultantId),
  ]);
  if (accounts.error) throw Object.assign(new Error(accounts.error.message), { status: 502 });
  if (records.error) throw Object.assign(new Error(records.error.message), { status: 502 });

  return {
    accountsById: new Map((accounts.data ?? []).map((u) => [u.id, u])),
    recordsByKey: new Map((records.data ?? []).map((r) => [r.client_key, r])),
  };
}

async function loadAppointments(consultantId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("client_name, client_user_id, appointment_date, issue, note, status, attachments")
    .eq("consultant_id", consultantId)
    .order("appointment_date", { ascending: false });
  if (error) throw Object.assign(new Error(error.message), { status: 502 });
  return data ?? [];
}

export async function listClients({ search, consultantId } = {}) {
  if (!supabase) {
    return seed.clients
      .filter((row) =>
        search ? row.name.toLowerCase().includes(search.toLowerCase()) : true,
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: "",
        address: "",
        jobTitle: "",
        age: null,
        code: null,
        package: row.package,
        registered: true,
        sessions: row.sessions,
        issue: "",
        lastConsult: row.last_seen,
        nextAppointment: null,
        lastSeen: formatLongDate(row.last_seen),
        status: row.status,
        note: "",
        attachments: [],
      }));
  }

  const entries = [...foldAppointments(await loadAppointments(consultantId)).values()];
  const { accountsById, recordsByKey } = await loadSideData(consultantId, entries);

  const term = search?.trim().toLowerCase();
  return entries
    .map((entry) =>
      merge(
        entry,
        recordsByKey.get(entry.key),
        entry.clientUserId ? accountsById.get(entry.clientUserId) : null,
      ),
    )
    .filter((client) => (term ? client.name.toLowerCase().includes(term) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One client, with the CV titles behind their attachments resolved. */
export async function getClient({ key, consultantId }) {
  if (!supabase) {
    const all = await listClients({ consultantId });
    const found = all.find((client) => client.id === key);
    if (!found) throw Object.assign(new Error("Client not found"), { status: 404 });
    return { ...found, resumes: [] };
  }

  const folded = foldAppointments(await loadAppointments(consultantId));
  const entry = folded.get(key);
  if (!entry) throw Object.assign(new Error("Client not found"), { status: 404 });

  const { accountsById, recordsByKey } = await loadSideData(consultantId, [entry]);
  const client = merge(
    entry,
    recordsByKey.get(key),
    entry.clientUserId ? accountsById.get(entry.clientUserId) : null,
  );

  // Attached CVs live in the client app's `cvs` table — resolve their titles.
  let resumes = [];
  const cvIds = entry.attachments.map((a) => a.cv_id).filter(Boolean);
  if (cvIds.length) {
    const { data } = await supabase
      .from("cvs")
      .select("id, title, updated_at")
      .in("id", cvIds);
    resumes = (data ?? []).map((cv) => ({
      id: cv.id,
      title: cv.title ?? "Resume",
      updatedAt: cv.updated_at ?? null,
    }));
  }

  // Files uploaded while booking live straight in the private storage bucket.
  for (const attachment of entry.attachments) {
    if (attachment.cv_id || !attachment.storage_path) continue;
    const fallback = decodeURIComponent(
      String(attachment.storage_path).split("/").pop() ?? "Resume",
    );
    resumes.push({
      id: attachment.storage_path,
      title: attachment.title || fallback,
      updatedAt: null,
      storagePath: attachment.storage_path,
    });
  }

  return { ...client, resumes };
}

/** Short-lived signed URL for a resume file uploaded at booking time. */
export async function getResumeUrl({ key, path, consultantId }) {
  if (!supabase) {
    throw Object.assign(new Error("Supabase is not configured"), { status: 503 });
  }

  const folded = foldAppointments(await loadAppointments(consultantId));
  const entry = folded.get(key);
  if (!entry) throw Object.assign(new Error("Client not found"), { status: 404 });

  // Only paths that actually appear on one of this client's bookings may open.
  const allowed = entry.attachments.some(
    (a) => a.storage_path && a.storage_path === path,
  );
  if (!allowed) throw Object.assign(new Error("File not found"), { status: 404 });

  const { data, error } = await supabase.storage
    .from("profile-resumes")
    .createSignedUrl(path, 300);
  if (error || !data) {
    throw Object.assign(new Error("Could not open the resume file"), { status: 502 });
  }
  return { url: data.signedUrl };
}

/** Next free CT#### for this consultant. */
async function nextCode(consultantId) {
  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select("code")
    .eq("consultant_id", consultantId);
  if (error) throw Object.assign(new Error(error.message), { status: 502 });

  const highest = (data ?? []).reduce((max, row) => {
    const n = Number(String(row.code ?? "").replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `CT${String(highest + 1).padStart(3, "0")}`;
}

/** Upserts the consultant-authored side of a client (details + note). */
export async function updateClient({ key, consultantId, patch }) {
  if (!supabase) throw Object.assign(new Error("Supabase is not configured"), { status: 503 });

  // The client must actually be one of this consultant's — no inventing rows.
  const folded = foldAppointments(await loadAppointments(consultantId));
  const entry = folded.get(key);
  if (!entry) throw Object.assign(new Error("Client not found"), { status: 404 });

  const changes = {};
  const text = (value) => (value === null ? null : String(value));
  if (patch.name !== undefined) changes.full_name = text(patch.name);
  if (patch.phone !== undefined) changes.phone = text(patch.phone);
  if (patch.email !== undefined) changes.email = text(patch.email);
  if (patch.address !== undefined) changes.address = text(patch.address);
  if (patch.jobTitle !== undefined) changes.job_title = text(patch.jobTitle);
  if (patch.status !== undefined) changes.status = text(patch.status);
  if (patch.note !== undefined) changes.note = text(patch.note);
  if (patch.age !== undefined) {
    const age = Number(patch.age);
    changes.age = patch.age === null || patch.age === "" || Number.isNaN(age) ? null : age;
  }

  const { data: existing, error: readError } = await supabase
    .from(RECORDS_TABLE)
    .select("id, code")
    .eq("consultant_id", consultantId)
    .eq("client_key", key)
    .maybeSingle();
  if (readError) throw Object.assign(new Error(readError.message), { status: 502 });

  if (existing) {
    const { error } = await supabase
      .from(RECORDS_TABLE)
      .update(changes)
      .eq("id", existing.id)
      .eq("consultant_id", consultantId);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
  } else {
    const { error } = await supabase.from(RECORDS_TABLE).insert({
      consultant_id: consultantId,
      client_key: key,
      client_user_id: entry.clientUserId,
      code: await nextCode(consultantId),
      full_name: changes.full_name ?? entry.name,
      ...changes,
    });
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
  }

  return getClient({ key, consultantId });
}
