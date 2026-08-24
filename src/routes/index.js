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
import { env, hasSupabase } from "../config/env.js";

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
