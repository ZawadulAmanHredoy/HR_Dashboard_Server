import { OAuth2Client } from "google-auth-library";
import { env, hasGoogle } from "../config/env.js";

const SCOPES = [
  "openid",
  "email",
  "profile",
  // Lets the console create Google Meet spaces (links) for online sessions.
  "https://www.googleapis.com/auth/meetings.space.created",
];

/** Null until GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI are set. */
export const googleClient = hasGoogle
  ? new OAuth2Client({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectUri: env.googleRedirectUri,
    })
  : null;

/** The consent screen URL the browser is sent to. */
export function consentUrl(state) {
  if (!googleClient) throw Object.assign(new Error("Google OAuth is not configured"), { status: 503 });
  return googleClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  });
}

/**
 * Swaps the one-time code for tokens and verifies the ID token signature and
 * audience, so the profile below is Google-attested rather than self-reported.
 */
export async function exchangeCode(code) {
  if (!googleClient) throw Object.assign(new Error("Google OAuth is not configured"), { status: 503 });

  const { tokens } = await googleClient.getToken(code);
  if (!tokens.id_token) {
    throw Object.assign(new Error("Google did not return an id_token"), { status: 502 });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw Object.assign(new Error("Google id_token had no subject"), { status: 502 });
  }
  if (payload.email && payload.email_verified === false) {
    throw Object.assign(new Error("Google account email is not verified"), { status: 403 });
  }

  return {
    id: payload.sub,
    email: payload.email ?? "",
    name: payload.name ?? payload.email ?? "",
    avatarUrl: payload.picture ?? null,
    provider: "google",
    // Offline grant (prompt=consent in consentUrl) — persisted server-side so
    // the console can create Meet links later without the consultant present.
    // NEVER goes into the session JWT.
    refreshToken: tokens.refresh_token ?? null,
    grantedScopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : [],
  };
}

/** True when the account granted the Meet-link scope at least once. */
export function hasMeetScope(grantedScopes) {
  return Boolean(grantedScopes?.includes("https://www.googleapis.com/auth/meetings.space.created"));
}
