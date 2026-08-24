// Runs the three booking-email sweeps once — same code the every-5-minute
// cron executes. Handy for testing without waiting for a tick.
// Usage:  node scripts/test-email-sweeps.mjs
import { config } from "dotenv";
config();

const { runConfirmationSweep, runReminderSweep } = await import(
  "../src/services/appointment-emails.service.js"
);

for (const [name, run] of [
  ["confirmations", runConfirmationSweep],
  ["reminders-24h", () => runReminderSweep("24h")],
  ["reminders-1h", () => runReminderSweep("1h")],
]) {
  try {
    console.log(`${name}: sent ${await run()}`);
  } catch (err) {
    console.error(`${name}: FAILED — ${err.message}`);
  }
}
