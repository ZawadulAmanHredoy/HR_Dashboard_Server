import { randomBytes } from "node:crypto";
import "dotenv/config";

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Dev convenience: a per-boot secret means sessions simply end on restart.
  console.warn(
    "[auth] SESSION_SECRET is not set — using a random secret for this process. Sessions will not survive a restart.",
  );
  return randomBytes(32).toString("hex");
}

// CLIENT_ORIGIN takes one origin or a comma-separated list. A list keeps the UI
// working from both origins while it moves between schemes or hosts (http ->
// https), so the switch needs no coordinated redeploy. Trailing slashes are
// stripped: CORS compares the Origin header verbatim and browsers never send one.
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT ?? 3000),

  /** Every origin allowed to call the API with credentials (CORS allow-list). */
  clientOrigins,
  /** The canonical UI origin — where sign-in redirects land. First one wins. */
  clientOrigin: clientOrigins[0] ?? "http://localhost:5173",

  /**
   * Public HTTPS origin used when building absolute URLs that browsers outside
   * the console must open (e.g. uploaded avatar URLs stored on profiles). The
   * storage host itself has no valid TLS, so avatars are re-served on this
   * origin instead. Defaults to the first CLIENT_ORIGIN entry.
   */
  publicSiteUrl: process.env.PUBLIC_SITE_URL ?? clientOrigins[0] ?? "http://localhost:5173",

  isProduction: process.env.NODE_ENV === "production",

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `http://localhost:${process.env.PORT ?? 3000}/api/auth/callback`,

  sessionSecret: sessionSecret(),
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? "aicv_session",
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS ?? 7),

  /** Refuse requests instead of falling back to the demo identity. */
  authRequired: String(process.env.AUTH_REQUIRED ?? "").toLowerCase() === "true",

  // SMTP for booking emails (office Gmail app password).
  mailHost: process.env.MAIL_HOST ?? "",
  mailPort: Number(process.env.MAIL_PORT ?? 587),
  mailUser: process.env.MAIL_USER ?? "",
  mailPass: process.env.MAIL_PASS ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",

  // Shared secret for server-to-server calls (client app -> "send confirmation now").
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "",
};

/** True once a Supabase project is wired up in .env. */
export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseKey);

/** True once the Google OAuth client is wired up in .env. */
export const hasGoogle = Boolean(
  env.googleClientId && env.googleClientSecret && env.googleRedirectUri,
);

/** True once SMTP is wired up in .env — booking emails are skipped otherwise. */
export const hasMail = Boolean(env.mailHost && env.mailUser && env.mailPass);
