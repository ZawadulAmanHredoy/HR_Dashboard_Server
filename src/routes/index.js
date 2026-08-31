import { Router } from "express";
import multer from "multer";
import appointments from "./appointments.routes.js";
import availability from "./availability.routes.js";
import auth from "./auth.routes.js";
import internal from "./internal.routes.js";
import {
  listClients,
  getClient,
  updateClient,
  getResumeUrl,
} from "../services/clients.service.js";
import {
  listUpcomingSessions,
} from "../services/sessions.service.js";
import { getConsultStats } from "../services/stats.service.js";
import { getProfile, updateProfile, uploadAvatar } from "../services/profile.service.js";
import { authMode, requireAuth } from "../middleware/auth.js";
import { env, hasGoogle, hasMail, hasSupabase } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
import { meetClientConfigured } from "../services/meet.service.js";
import { isMailConfigured } from "../services/mailer.service.js";

const router = Router();
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/** Public: lets the client (and deploy checks) see how the API is wired up. */
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    database: hasSupabase ? "supabase" : "in-memory seed",
    auth: authMode(),
    // "ephemeral" means SESSION_SECRET is unset: sign-ins break across restarts.
    session: process.env.SESSION_SECRET ? "persistent" : "ephemeral",
    redirectUri: env.googleRedirectUri,
  });
});

/**
 * Public test endpoint — a single URL the team can open to see every
 * integration's live status: database, Google OAuth + Meet, SMTP, and the
 * internal secret handshake. Each check reports ready/ok vs the failure.
 */
router.get("/test", async (req, res) => {
  const report = {
    status: "ok",
    name: "Hredoy",
    message: "Welcome to Hredoy",
    apiUrl: `${req.protocol}://${req.get("host")}`,
    checks: {
      database: { configured: hasSupabase, ready: false },
      googleOAuth: { configured: hasGoogle, ready: false },
      googleMeet: { configured: meetClientConfigured(), ready: false },
      mail: { configured: hasMail, ready: false },
      internalSecret: { configured: Boolean(env.internalApiSecret), ready: false },
      session: process.env.SESSION_SECRET ? "persistent" : "ephemeral",
    },
  };

  // Database: a real round-trip against a tiny, always-present table.
  if (hasSupabase) {
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1);
      report.checks.database.ready = !error;
      report.checks.database.detail = error?.message ?? "query ok";
    } catch (err) {
      report.checks.database.detail = err.message;
    }
  }

  // Google: client configured, and a stored refresh token exists for Meet.
  if (hasGoogle) report.checks.googleOAuth.ready = true;
  if (meetClientConfigured()) {
    const { data } = await supabase.from("google_tokens").select("id, scope").limit(1);
    const token = data?.[0];
    report.checks.googleMeet.ready = Boolean(token?.id);
    report.checks.googleMeet.scopeGranted = /meetings\.space\.created/.test(
      token?.scope ?? "",
    );
  }

  // SMTP: transporter built lazily, so just report that credentials are present.
  report.checks.mail.ready = isMailConfigured();
  report.checks.internalSecret.ready = Boolean(env.internalApiSecret);

  res.json(report);
});

// Sign-in, callback and session lookup are public by necessity.
router.use("/auth", auth);

// Server-to-server calls guard themselves with a shared-secret header.
router.use("/internal", internal);

// Everything below needs a signed-in consultant.
router.use(requireAuth);

/** Who the current session belongs to — handy while wiring the Google flow up. */
router.get("/me", (req, res) => {
  res.json({ data: req.user });
});

router.use("/appointments", appointments);
router.use("/availability", availability);

router.get("/clients", async (req, res) => {
  const data = await listClients({ search: req.query.search, consultantId: req.user.id });
  res.json({ data });
});

// The client key can be a uuid or "name:<client name>", so it arrives encoded.
router.get("/clients/:key", async (req, res) => {
  const data = await getClient({
    key: decodeURIComponent(req.params.key),
    consultantId: req.user.id,
  });
  res.json({ data });
});

router.patch("/clients/:key", async (req, res) => {
  const data = await updateClient({
    key: decodeURIComponent(req.params.key),
    consultantId: req.user.id,
    patch: req.body ?? {},
  });
  res.json({ data });
});

// Signed, short-lived URL for a resume uploaded during booking.
router.get("/clients/:key/resume-url", async (req, res) => {
  const data = await getResumeUrl({
    key: decodeURIComponent(req.params.key),
    path: String(req.query.path ?? ""),
    consultantId: req.user.id,
  });
  res.json({ data });
});

router.get("/sessions/upcoming", async (req, res) => {
  const data = await listUpcomingSessions(req.user.id);
  res.json({ data });
});

router.get("/stats", async (req, res) => {
  const data = await getConsultStats(req.user.id);
  res.json({ data });
});

router.get("/profile", async (req, res) => {
  const data = await getProfile(req.user);
  res.json({ data });
});

router.patch("/profile", async (req, res) => {
  const data = await updateProfile(req.user, req.body ?? {});
  res.json({ data });
});

// Profile picture upload — multipart/form-data with a "file" field.
router.post("/profile/avatar", avatarUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided." });
    }
    const data = await uploadAvatar({ user: req.user, file: req.file });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
