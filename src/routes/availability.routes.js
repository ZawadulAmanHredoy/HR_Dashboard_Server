import { Router } from "express";
import {
  getMonthAvailability,
  toggleHoliday,
  createSlots,
  deleteSlot,
} from "../services/availability.service.js";
import { AVAILABILITY_MONTH } from "../data/seed.js";

const router = Router();

router.get("/", async (req, res) => {
  const year = Number(req.query.year ?? AVAILABILITY_MONTH.year);
  const month = Number(req.query.month ?? AVAILABILITY_MONTH.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "year and month (1-12) must be integers" });
  }

  const data = await getMonthAvailability(year, month, req.user.id);
  res.json({ data });
});

router.post("/slots", async (req, res) => {
  const { date, times, duration_minutes, mode, repeat_weeks } = req.body ?? {};
  try {
    const data = await createSlots({
      date,
      times,
      duration_minutes,
      mode,
      repeat_weeks,
      // Stamp the owning consultant so the client website scopes slots to them.
      consultantId: req.user.id,
    });
    res.status(201).json({ data });
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.delete("/slots/:id", async (req, res) => {
  try {
    const data = await deleteSlot(req.params.id, req.user.id);
    res.json({ data });
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.post("/holidays", async (req, res) => {
  const { date } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    return res.status(400).json({ error: "date must be an ISO date (YYYY-MM-DD)" });
  }

  const data = await toggleHoliday(date, req.user.id);
  res.json({ data });
});

export default router;
