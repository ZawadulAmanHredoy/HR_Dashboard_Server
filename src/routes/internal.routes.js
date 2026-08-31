// Server-to-server endpoints. The client app (Next.js) calls these right
// after a successful booking so the confirmation email goes out instantly;
// the shared-secret header keeps the public internet out.
import { Router } from "express";
import { env } from "../config/env.js";
import {
  notifyAppointmentCancelled,
  notifyBookingConfirmed,
} from "../services/appointment-emails.service.js";
import { ensureMeetingLink } from "../services/meet.service.js";

const router = Router();

/** Reject callers that fail the shared-secret handshake. */
function requireInternalSecret(req, res) {
  if (!env.internalApiSecret) {
    res.status(503).json({ error: "Internal calls not configured" });
    return false;
  }
  if (req.get("x-internal-secret") !== env.internalApiSecret) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.post("/appointments/:id/booking-email", async (req, res) => {
  if (!requireInternalSecret(req, res)) return;

  try {
    // Mint the Meet space BEFORE mailing, mirroring consultant-created
    // bookings, so the confirmation carries the join link. Best-effort: on
    // failure the cron sweep attaches a link within minutes.
    await ensureMeetingLink(req.params.id).catch((err) =>
      console.error("[internal] meet link failed:", err.message),
    );
    const sent = await notifyBookingConfirmed(req.params.id);
    res.json({ sent });
  } catch (err) {
    console.error("[internal] booking-email failed:", err.message);
    res.status(500).json({ error: "Could not send booking email" });
  }
});

// Server-to-server cancellation notice. The client app (Next.js) calls this
// right after flipping a booking to "cancelled" so the client gets the
// cancellation email instantly.
router.post("/appointments/:id/cancel-email", async (req, res) => {
  if (!requireInternalSecret(req, res)) return;

  try {
    const sent = await notifyAppointmentCancelled(req.params.id);
    res.json({ sent });
  } catch (err) {
    console.error("[internal] cancel-email failed:", err.message);
    res.status(500).json({ error: "Could not send cancellation email" });
  }
});

export default router;
