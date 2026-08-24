// Periodic booking emails: confirmations that missed their instant send,
// 24-hour reminders, 1-hour reminders. Runs on the console server because
// that process is always up; all queries are stamp-guarded so overlapping
// ticks (or a restart) never double-send.
import cron from "node-cron";
import { hasMail } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
import {
  runConfirmationSweep,
  runReminderSweep,
} from "../services/appointment-emails.service.js";
import { runMeetingLinkSweep } from "../services/meet.service.js";

const TASKS = [
  // Meet links first so confirmations/reminders sent on the same tick
  // already contain the join link.
  ["meet-links", () => runMeetingLinkSweep()],
  ["confirmations", () => runConfirmationSweep()],
  ["reminders-24h", () => runReminderSweep("24h")],
  ["reminders-1h", () => runReminderSweep("1h")],
];

export function startEmailJobs() {
  if (!supabase || !hasMail) {
    console.log("[mail] email jobs disabled — set SUPABASE_URL + MAIL_* in .env to enable");
    return;
  }

  cron.schedule("*/5 * * * *", async () => {
    for (const [name, task] of TASKS) {
      try {
        const sent = await task();
        if (sent > 0) console.log(`[mail:${name}] sent ${sent} email(s)`);
      } catch (err) {
        console.error(`[mail:${name}] sweep failed:`, err.message);
      }
    }
  });

  console.log("[mail] booking email jobs scheduled (every 5 minutes)");
}
