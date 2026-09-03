// Who may open the admin console.
//
// Admins are listed by email in `admin_emails` rather than flagged on a users
// row, because an admin may not have signed in yet — there is no row to flag
// until they do. The list is tiny and rarely changes, so it is cached briefly
// instead of being read on every request.
import { supabase } from "../lib/supabase.js";

const TTL_MS = 60_000;
let cache = { at: 0, emails: new Set() };

async function adminEmails() {
  if (!supabase) return new Set();
  if (cache.at && Date.now() - cache.at < TTL_MS) return cache.emails;

  const { data, error } = await supabase.from("admin_emails").select("email");
  if (error) {
    // Serve the previous list rather than locking every admin out on a blip.
    console.error("[roles] could not load admin_emails:", error.message);
    return cache.emails;
  }

  cache = {
    at: Date.now(),
    emails: new Set((data ?? []).map((row) => String(row.email).toLowerCase())),
  };
  return cache.emails;
}

export async function isAdmin(email) {
  if (!email) return false;
  return (await adminEmails()).has(String(email).toLowerCase());
}

/**
 * Keep users.role in step with the allow-list. Best-effort: the row belongs to
 * the client app and may not exist yet, and a failure here must never block a
 * sign-in — isAdmin() is the authority either way.
 */
export async function syncUserRole(email) {
  if (!supabase || !email) return;
  const role = (await isAdmin(email)) ? "admin" : "consultant";
  const { error } = await supabase
    .from("users")
    .update({ role })
    .ilike("email", email);
  if (error) console.error("[roles] could not sync users.role:", error.message);
}

/** Every admin address, for notifying them of a new application. */
export async function adminRecipients() {
  return [...(await adminEmails())];
}
