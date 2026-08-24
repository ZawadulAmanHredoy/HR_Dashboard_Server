import { Router } from "express";
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from "../services/appointments.service.js";

const router = Router();

const STATUSES = ["upcoming", "past", "cancelled"];

router.get("/", async (req, res) => {
  const { status, month, year } = req.query;

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  const data = await listAppointments({
    status,
    fromMonth: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    consultantId: req.user.id,
  });

  res.json({ data });
});

router.post("/", async (req, res) => {
  const { date, startTime, endTime, client, issue } = req.body ?? {};
  const missing = Object.entries({ date, startTime, endTime, client, issue })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  // Stamp the creating consultant so Meet links / scoping know the owner.
  const data = await createAppointment({ ...req.body, consultantId: req.user.id });
  res.status(201).json({ data });
});

router.patch("/:id", async (req, res) => {
  const data = await updateAppointment(req.params.id, req.body ?? {}, req.user.id);
  res.json({ data });
});

router.delete("/:id", async (req, res) => {
  const data = await deleteAppointment(req.params.id, req.user.id);
  res.json({ data });
});

export default router;
