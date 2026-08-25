# HR Dashboard — Consultant Console (Server)

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Google_OAuth-2-4285F4?logo=google&logoColor=white)

A RESTful API server for the HR Dashboard Consultant Console. Built with Express 5, Supabase (PostgreSQL), Google OAuth, and scheduled email notifications.

> **Part of a monorepo** — this is the backend for the [HR Dashboard Client](https://github.com/ZawadulAmanHredoy/HR_Dashboard_Client). The app runs with no configuration: without Supabase credentials it serves in-memory seed data, and the login screen offers a demo mode button.

## Features

- **Authentication** — Google OAuth 2.0 with server-side code flow, CSRF state verification, JWT session cookies (`httpOnly`, `sameSite=lax`), and demo mode fallback
- **Appointments** — Full CRUD with automatic Google Meet link creation, email confirmations, rescheduling, and cancellation notifications
- **Availability** — Slot management with weekly repeat (x4 weeks), holiday marking, and monthly calendar views
- **Client Records** — Client profiles derived from appointment history with consultant-authored notes and signed resume URLs from Supabase Storage
- **Profile Management** — Consultant profile CRUD with avatar upload (JPG/PNG/WebP, max 2MB) to Supabase Storage
- **Dashboard Stats** — Computed statistics tiles (total consults, hours delivered, avg. rating, repeat clients) from appointment data
- **Email Notifications** — Bilingual (English/Bengali) HTML templates via SMTP with cron-based sweeps for confirmations, reminders (24h + 1h), and cancellations
- **Google Meet Integration** — Automatic Meet space creation via stored OAuth refresh tokens with cron sweep for missed links
- **Health Check** — `GET /api/health` reports database source, auth mode, and session persistence status
- **Seed Data** — In-memory fallback when no database is configured; seed script for Supabase

## Tech Stack

| Technology | Purpose |
|---|---|
| Express 5 | Web framework |
| Supabase JS | PostgreSQL database client (bypasses RLS with service role key) |
| Google Auth Library | OAuth 2.0 + ID token verification |
| JSON Web Tokens | Session management (httpOnly cookie) |
| Nodemailer | SMTP email transport |
| Node-Cron | Scheduled email jobs (every 5 minutes) |
| Multer | File upload handling (multipart) |
| Nodemon | Dev auto-restart |

## Project Structure

```
src/
├── index.js                 # Entry point: creates app, listens on PORT, starts email cron jobs
├── app.js                   # Express app factory: CORS, JSON, cookie-parser, /api routes, SPA fallback
├── config/
│   └── env.js               # Environment variable loader + hasSupabase / hasGoogle / hasMail helpers
├── lib/
│   ├── supabase.js          # Supabase client singleton (null when unconfigured)
│   ├── session.js           # JWT sign/verify/cookie helpers (httpOnly, sameSite=lax)
│   └── google.js            # Google OAuth2Client, consent URL builder, code exchange + ID token verification
├── middleware/
│   └── auth.js              # requireAuth middleware + DEMO_USER fallback + authMode()
├── routes/
│   ├── index.js             # Main router: /health, /auth, /me, /appointments, /availability, /clients, /sessions, /stats, /profile
│   ├── auth.routes.js       # /session, /google, /callback, /demo, /logout
│   ├── appointments.routes.js
│   ├── availability.routes.js
│   └── internal.routes.js   # POST /appointments/:id/booking-email (server-to-server, x-internal-secret)
├── services/
│   ├── appointments.service.js       # CRUD + auto Meet link + confirmation email on create
│   ├── availability.service.js       # Monthly slots, CRUD with weekly repeat, holiday toggle
│   ├── clients.service.js            # Client list/detail from appointments + client_records, signed resume URLs
│   ├── profile.service.js            # Profile get/update, avatar upload to Supabase Storage
│   ├── stats.service.js              # Dashboard stat tiles computed from appointment data
│   ├── sessions.service.js           # Upcoming sessions list
│   ├── meet.service.js               # Google Meet space creation, cron sweep for missed links
│   ├── mailer.service.js             # Nodemailer SMTP transport + bilingual HTML email templates
│   └── appointment-emails.service.js # DB-facing email orchestration + cron sweeps
├── data/
│   └── seed.js              # In-memory seed data (profile, appointments, clients, availability, metrics)
├── utils/
│   └── format.js            # Date/time formatting (formatTime, splitDate, formatLongDate, toISODate, etc.)
└── jobs/
    └── email-cron.js        # node-cron every 5 min: meet-links, confirmations, reminders

supabase/
└── schema.sql               # Full PostgreSQL schema (profiles, clients, appointments, availability_slots, holidays, consult_sessions, consult_metrics + RLS)

scripts/
├── seed.js                  # Upserts demo rows into all Supabase tables
├── test-mail.mjs            # SMTP connection test + sends test email
└── test-email-sweeps.mjs    # Manual trigger for confirmation + reminder email sweeps
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (or use in-memory mode — no config needed)
- Google Cloud OAuth credentials (optional — demo mode works without them)
- SMTP server access (optional — for email notifications)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Express
PORT=3000
CLIENT_ORIGIN=http://localhost:5173

# Google OAuth (optional — demo mode works without these)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session
SESSION_SECRET=             # Auto-generated per boot if blank (logins reset on restart)
SESSION_COOKIE_NAME=aicv_session
SESSION_MAX_AGE_DAYS=7
AUTH_REQUIRED=false         # Set true to reject unauthenticated requests even without Google

# Supabase (optional — falls back to in-memory seed data)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# SMTP (optional — for email notifications)
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASS=
MAIL_FROM=

# Internal (shared secret for server-to-server API calls)
INTERNAL_API_SECRET=
```

### Development

```bash
npm run dev
```

Runs with Nodemon for auto-restart on file changes. Server starts on `http://localhost:3000`.

### Production

```bash
npm start
```

### Seed Database

```bash
npm run seed
```

Populates Supabase with demo consultant, client, and appointment data. Profiles are skipped — those are created on first Google sign-in.

## Authentication Flow

Express owns the entire OAuth flow — Google redirects back to the API, the server exchanges the code, verifies the ID token, and issues its own httpOnly JWT cookie.

```
/login
  → GET  /api/auth/google            server redirects to Google consent
  → Google
  → GET  /api/auth/callback?code=…   server exchanges + verifies, sets cookie
  → back to the client page you started from
```

Security measures:
- **CSRF**: `/auth/google` signs a short-lived `state` JWT and mirrors it in an httpOnly cookie; `/auth/callback` refuses any mismatch
- **ID token**: verified through `google-auth-library` (signature + audience), unverified Google emails rejected
- **Open redirect**: post-login `redirect` forced to a path on `CLIENT_ORIGIN`
- **Cookie**: `httpOnly`, `sameSite=lax`, `secure` in production

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/session` | Current user + auth mode (public) |
| GET | `/api/auth/google` | Redirect to Google consent (public) |
| GET | `/api/auth/callback` | OAuth callback — exchange code, set cookie (public) |
| POST | `/api/auth/demo` | Demo sign-in (403 once Google is configured) |
| POST | `/api/auth/logout` | Clear session cookie |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profile` | Get consultant profile |
| PATCH | `/api/profile` | Update profile fields |
| POST | `/api/profile/avatar` | Upload profile picture (JPG/PNG/WebP, max 2MB) |

### Appointments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/appointments?status=&year=&month=` | List (filter by status, year, month) |
| POST | `/api/appointments` | Create appointment (auto Meet link + confirmation email) |
| PATCH | `/api/appointments/:id` | Update/reschedule |
| DELETE | `/api/appointments/:id` | Cancel/delete |

### Availability

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/availability?year=&month=` | Monthly slots + holidays |
| POST | `/api/availability/slots` | Add slot(s) with optional weekly repeat |
| DELETE | `/api/availability/slots/:id` | Remove slot |
| POST | `/api/availability/holidays` | Toggle holiday |

### Other

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Status + database + auth mode (public) |
| GET | `/api/me` | Current signed-in consultant |
| GET | `/api/clients?search=` | Client records table |
| GET | `/api/clients/:key` | Client detail + resumes |
| PATCH | `/api/clients/:key` | Update client record |
| GET | `/api/sessions/upcoming` | Upcoming sessions |
| GET | `/api/stats` | Dashboard statistics |
| POST | `/api/internal/appointments/:id/booking-email` | Server-to-server instant confirmation (shared secret) |

Responses: `{ "data": ... }` on success, `{ "error": "message" }` on failure.

## Database

Uses **Supabase** (hosted PostgreSQL). The server uses the service role key to bypass Row Level Security (RLS). The browser never talks to Postgres directly. Supabase Auth is not used — Express owns sign-in.

### Tables

| Table | Description |
|---|---|
| `profiles` | Consultant profiles (id = Google sub claim) |
| `clients` | Registered clients |
| `appointments` | Booking records with date, time, client, issue, status, mode, note, meeting link |
| `availability_slots` | Consultant time slots (unique on slot_date + start_time) |
| `holidays` | Marked unavailable days |
| `consult_sessions` | Session records referencing clients |
| `consult_metrics` | Aggregate stats (total consults, hours, rating, repeat rate) |
| `google_tokens` | Stored OAuth refresh tokens for Meet integration |
| `client_records` | Per-consultant-per-client notes and details |
| `users` | Client app user accounts |
| `cvs` | Client resumes/CVs |

When no Supabase credentials are provided, all services fall back to an **in-memory seed store** so the UI works without a database.

### Setup

1. Create a Supabase project
2. Run `supabase/schema.sql` in the SQL editor
3. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
4. Run `npm run seed` to populate demo data
5. Restart — `GET /api/health` will report `"database": "supabase"`

## Utility Scripts

| Script | Description |
|---|---|
| `node scripts/seed.js` | Upserts demo rows into all Supabase tables |
| `node scripts/test-mail.mjs [email]` | SMTP sanity check + sends test email |
| `node scripts/test-email-sweeps.mjs` | Manually runs confirmation + reminder email sweeps |

## Cron Jobs

The server runs `node-cron` jobs every 5 minutes on startup:

1. **Meet link sweep** — catches any appointments missing a Google Meet link
2. **Confirmation sweep** — sends confirmation emails for newly created bookings
3. **24-hour reminder sweep** — sends reminders for sessions starting within 24 hours
4. **1-hour reminder sweep** — sends reminders for sessions starting within 1 hour

All sweeps are stamp-guarded to prevent double-sends on restart or overlapping ticks.

## License

This project is private and proprietary.
