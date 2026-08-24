import { createApp } from "./app.js";
import { env, hasGoogle, hasMail, hasSupabase } from "./config/env.js";
import { authMode } from "./middleware/auth.js";
import { startEmailJobs } from "./jobs/email-cron.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
  console.log(
    hasSupabase
      ? "Data source: Supabase"
      : "Data source: in-memory seed (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to use Supabase)",
  );
  console.log(
    hasGoogle
      ? `Auth: Google OAuth -> ${env.googleRedirectUri}`
      : `Auth: ${authMode()} (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to enable Google sign-in)`,
  );
  startEmailJobs();
});
