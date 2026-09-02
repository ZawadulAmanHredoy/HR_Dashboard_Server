import { randomBytes } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env, hasGoogle } from "../config/env.js";
import { consentUrl, exchangeCode } from "../lib/google.js";
import {
  clearSessionCookie,
  readSession,
  setSessionCookie,
  tokenFromRequest,
} from "../lib/session.js";
import { authMode, DEMO_USER } from "../middleware/auth.js";

const router = Router();

const STATE_COOKIE = "aicv_oauth_state";
const STATE_TTL_SECONDS = 600;

/** Only ever redirect to a path on our own client — never to an absolute URL. */
function safePath(value) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Which UI started this sign-in? Browsers reveal it via the Origin/Referer
 * headers, but we only trust a value on the CORS allow-list. Anything else
 * falls back to the configured canonical client so the setup never becomes an
 * open redirect to a stranger.
 */
function requestingClientOrigin(req) {
  const probe = req.get("origin") ?? req.get("referer");
  if (!probe) return null;
  let candidate;
  try {
    candidate = new URL(probe).origin;
  } catch {
    candidate = probe.trim().replace(/\/+$/, "");
  }
  return env.clientOrigins.includes(candidate) ? candidate : null;
}

function clientUrl(path, origin) {
  return `${origin ?? env.clientOrigin}${safePath(path)}`;
}

/* -------------------------------------------------------------- public API */

/** What the login screen needs: who is signed in, and whether Google is wired up. */
router.get("/session", (req, res) => {
  res.json({
    data: {
      user: readSession(tokenFromRequest(req)),
      mode: authMode(),
    },
  });
});

/** Step 1 — send the browser to Google's consent screen. */
router.get("/google", (req, res) => {
  if (!hasGoogle) {
    return res.status(503).json({
      error:
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in server/.env",
    });
  }

  // Signed state, echoed back by Google and matched against the cookie (CSRF).
  const state = jwt.sign(
    {
      nonce: randomBytes(16).toString("hex"),
      returnTo: safePath(req.query.redirect),
      origin: requestingClientOrigin(req),
    },
    env.sessionSecret,
    { expiresIn: STATE_TTL_SECONDS },
  );

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    maxAge: STATE_TTL_SECONDS * 1000,
    path: "/",
  });

  res.redirect(consentUrl(state));
});

/**
 * Step 2 — Google redirects here (GOOGLE_REDIRECT_URI). We verify the state,
 * exchange the code, mint our own session cookie and hand back to the client.
 */
router.get("/callback", async (req, res) => {
  const fail = (message, origin) =>
    res.redirect(
      `${clientUrl("/login", origin)}?error=${encodeURIComponent(message)}`,
    );

  if (req.query.error) {
    return fail(String(req.query.error_description ?? req.query.error));
  }

  const { code, state } = req.query;
  const cookieState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/" });

  if (!code) return fail("Google did not return an authorization code");
  if (!state || !cookieState || state !== cookieState) {
    return fail("Sign-in state did not match. Please try again.");
  }

  let returnTo = "/";
  let origin;
  try {
    const verified = jwt.verify(String(state), env.sessionSecret);
    returnTo = safePath(verified.returnTo);
    origin = verified.origin ?? env.clientOrigin;
  } catch (stateError) {
    // A signature failure (rather than an expiry) almost always means the
    // callback reached a different process than the one that started sign-in.
    // Only an expired-but-genuinely-signed state may steer the redirect; a
    // signature failure falls back to the canonical client, never to the state.
    const safeOrigin =
      stateError.name === "TokenExpiredError"
        ? (jwt.decode(String(state))?.origin ?? env.clientOrigin)
        : env.clientOrigin;
    return fail(
      stateError.name === "TokenExpiredError"
        ? "Sign-in link expired. Please try again."
        : "Sign-in could not be verified. If the API restarted mid sign-in, or the callback reached a different server, set SESSION_SECRET in server/.env and make sure GOOGLE_REDIRECT_URI points at this server.",
      safeOrigin,
    );
  }

  try {
    const { refreshToken, grantedScopes, ...user } = await exchangeCode(String(code));

    // Persist the offline grant (if Google issued one) for Meet-link creation.
    if (refreshToken) {
      const { upsertRefreshToken } = await import("../services/meet.service.js");
      await upsertRefreshToken(user.id, refreshToken, grantedScopes).catch((err) =>
        console.error("[auth] could not store refresh token:", err.message),
      );
    }

    setSessionCookie(res, user);
    return res.redirect(clientUrl(returnTo, origin));
  } catch (error) {
    console.error("[auth] Google callback failed:", error);
    return fail(error.message ?? "Google sign-in failed");
  }
});

/** Credential-free fallback so the console stays usable before setup. */
router.post("/demo", (_req, res) => {
  if (hasGoogle || env.authRequired) {
    return res.status(403).json({ error: "Demo sign-in is disabled" });
  }
  setSessionCookie(res, DEMO_USER);
  res.json({ data: DEMO_USER });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

export default router;
