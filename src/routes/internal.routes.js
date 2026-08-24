// Server-to-server endpoints. The client app (Next.js) calls these right
// after a successful booking so the confirmation email goes out instantly;
// the shared-secret header keeps the public internet out.
import { Router } from "express";
import { env } from "../config/env.js";
import { notifyBookingConfirmed } from "../services/appointment-emails.service.js";
import { ensureMeetingLink } from "../services/meet.service.js";

const router = Router();

router.post("/appointments/:id/booking-email", async (req, res) => {
  if (!env.internalApiSecret) {
    return res.status(503).json({ error: "Internal calls not configured" });
  }
  if (req.get("x-internal-secret") !== env.internalApiSecret) {
    return res.status(403).json({ error: "Forbidden" });
  }

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

export default router;
