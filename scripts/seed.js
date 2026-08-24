/**
 * Populates a Supabase project with the demo rows the UI was designed against.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env, and the
 * tables from supabase/schema.sql to exist.
 *
 *   npm run seed
 */
import { supabase } from "../src/lib/supabase.js";
import * as seed from "../src/data/seed.js";

if (!supabase) {
  console.error(
    "Supabase is not configured. Copy .env.example to .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

// `profiles` is intentionally absent: rows there are keyed to Supabase Auth
// users and are created on first Google sign-in.
const tables = [
  ["clients", seed.clients],
  ["appointments", seed.appointments],
  ["availability_slots", seed.availabilitySlots],
  ["holidays", seed.holidays],
  ["consult_sessions", seed.consultSessions],
  ["consult_metrics", [seed.consultMetrics]],
];

for (const [table, rows] of tables) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    console.error(`✗ ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${table}: ${rows.length} row(s)`);
}

console.log("Seed complete.");
