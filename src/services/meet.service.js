// Google Meet link creation for online sessions. Uses the consultant's stored
// offline grant to mint short-lived access tokens and create real Meet spaces
// (meet.google.com/xxx-xxxx-xxx). Everything is best-effort: a failure never
// blocks bookings or emails — the cron sweep retries until the link exists.
import { OAuth2Client } from "google-auth-library";
import { env, hasGoogle } from "../config/env.js";
import { supabase } from "../lib/supabase.js";

const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const MEET_API = "https://meet.googleapis.com/v2/spaces";

export function meetClientConfigured() {
  return Boolean(hasGoogle && supabase);
}

/* ------------------------------------------------------------ token store */

export async function upsertRefreshToken(profileId, refreshToken, grantedScopes) {
  if (!supabase) return false;
  const { error } = await supabase.from("google_tokens").upsert(
    {
      id: profileId,
      refresh_token: refreshToken,
      scope: grantedScopes?.join(" ") ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  return true;
}

export async function getRefreshToken(profileId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("google_tokens")
    .select("refresh_token")
    .eq("id", profileId)
    .maybeSingle();
  return data?.refresh_token ?? null;
}

/** Short-lived access token for the Meet API, refreshed from the stored grant. */
async function getAccessToken(profileId) {
  const refreshToken = await getRefreshToken(profileId);
  if (!refreshToken) return null;

  const client = new OAuth2Client(env.googleClientId, env.googleClientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials.access_token ?? null;
}

/* ----------------------------------------------------------- meet spaces */

/** Creates one Meet space; returns its meetingUri or null when not possible. */
export async function createMeetSpace(profileId) {
  const accessToken = await getAccessToken(profileId);
  if (!accessToken) return null;

  const res = await fetch(MEET_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const body = await res.text();
    // 403 usually means the Google Meet API is not enabled on the cloud project.
    console.error(`[meet] space create failed (${res.status}):`, body.slice(0, 300));
    return null;
  }

  const space = await res.json();
  return space.meetingUri ?? null;
}

/**
 * Give an appointment its Meet link if it qualifies: Online mode, upcoming,
 * in the future, no link yet, and the consultant has connected Google.
 * Returns the link, or null when nothing was created.
 */
export async function ensureMeetingLink(appointmentId) {
  if (!meetClientConfigured()) return null;

  const { data: appt, error } = await supabase
    .from("appointments")
    .select("id, mode, status, starts_at, meeting_link, consultant_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !appt?.consultant_id) return null;

  if (
    appt.meeting_link ||
    appt.mode !== "Online" ||
    appt.status !== "upcoming" ||
    !appt.starts_at ||
    new Date(appt.starts_at) <= new Date()
  ) {
    return appt.meeting_link ?? null;
  }

  const uri = await createMeetSpace(appt.consultant_id);
  if (!uri) return null;

  const { error: updateError } = await supabase
    .from("appointments")
    .update({ meeting_link: uri })
    .eq("id", appointmentId)
    .is("meeting_link", null);

  if (updateError) {
    console.error("[meet] could not save link:", updateError.message);
    return null;
  }
  console.log(`[meet] ${appointmentId} -> ${uri}`);
  return uri;
}

/** Cron catch-up: upcoming online sessions that are still missing a link. */
export async function runMeetingLinkSweep() {
  if (!meetClientConfigured()) return 0;

  const { data: rows, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("mode", "Online")
    .eq("status", "upcoming")
    .gt("starts_at", new Date().toISOString())
    .is("meeting_link", null)
    .order("starts_at")
    .limit(10);
  if (error) throw new Error(error.message);

  let created = 0;
  for (const row of rows ?? []) {
    if (await ensureMeetingLink(row.id)) created += 1;
  }
  return created;
}
