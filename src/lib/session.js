import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const MAX_AGE_MS = env.sessionMaxAgeDays * 24 * 60 * 60 * 1000;

/** httpOnly so the token is never readable from client-side JavaScript. */
export function cookieOptions() {
  return {
    httpOnly: true,
    // SameSite=None + Secure is required when the frontend and API live on
    // different origins (e.g. a localhost UI calling an HTTPS api host), so
    // the auth cookie is sent on cross-site requests. Local (http) stays Lax.
    sameSite: env.isProduction ? "none" : "lax",
    secure: env.isProduction,
    maxAge: MAX_AGE_MS,
    path: "/",
  };
}

export function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.avatarUrl,
      provider: user.provider,
    },
    env.sessionSecret,
    { expiresIn: `${env.sessionMaxAgeDays}d` },
  );
}

/** Returns the user, or null when the token is missing, tampered with or expired. */
export function readSession(token) {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, env.sessionSecret);
    return {
      id: claims.sub,
      email: claims.email ?? "",
      name: claims.name ?? "",
      avatarUrl: claims.picture ?? null,
      provider: claims.provider ?? "google",
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, user) {
  res.cookie(env.sessionCookie, signSession(user), cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(env.sessionCookie, { ...cookieOptions(), maxAge: undefined });
}

/** Cookie first (browser), bearer second (curl, mobile clients). */
export function tokenFromRequest(req) {
  const cookie = req.cookies?.[env.sessionCookie];
  if (cookie) return cookie;

  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}
