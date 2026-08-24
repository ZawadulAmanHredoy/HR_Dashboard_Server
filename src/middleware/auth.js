import { env, hasGoogle } from "../config/env.js";
import { readSession, tokenFromRequest } from "../lib/session.js";

/** Identity used when no Google OAuth client is wired up yet. */
export const DEMO_USER = {
  id: "demo-user",
  email: "demo@aicvmaker.com",
  name: "Demo Consultant",
  avatarUrl: null,
  provider: "demo",
};

/** "google" once credentials exist, otherwise the credential-free fallback. */
export function authMode() {
  if (hasGoogle) return "google";
  return env.authRequired ? "unconfigured" : "demo";
}

/**
 * Puts the signed-in consultant on `req.user`.
 *
 * The session is our own JWT (httpOnly cookie), minted after Google hands back a
 * verified profile at GOOGLE_REDIRECT_URI. Before credentials exist the API can
 * run in demo mode; AUTH_REQUIRED=true turns that fallback off.
 */
export function requireAuth(req, res, next) {
  const user = readSession(tokenFromRequest(req));

  if (user) {
    req.user = user;
    return next();
  }

  if (!hasGoogle && !env.authRequired) {
    // No identity provider configured: fall back to the seeded consultant.
    req.user = DEMO_USER;
    return next();
  }

  if (!hasGoogle && env.authRequired) {
    return res.status(503).json({
      error:
        "Auth is required but Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.",
    });
  }

  return res.status(401).json({ error: "Not signed in" });
}
