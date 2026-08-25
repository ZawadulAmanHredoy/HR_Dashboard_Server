# HR Dashboard — Consultant Console (Server)

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Google_OAuth-2-4285F4?logo=google&logoColor=white)

A RESTful API server for the HR Dashboard Consultant Console. Built with Express 5, Supabase (PostgreSQL), Google OAuth, and scheduled email notifications.

## Features

- **Authentication** — Google OAuth 2.0 with JWT session cookies and demo mode fallback
- **Appointments** — Full CRUD with email confirmations, rescheduling, and cancellation notifications
- **Availability** — Slot management with weekly repeat, holiday marking, and Google Meet link creation
- **Client Records** — Client profiles derived from appointment history with consultant-authored notes
- **Profile Management** — Consultant profile CRUD with avatar upload to Supabase Storage
- **Dashboard Stats** — Computed statistics tiles from appointment data
- **Email Notifications** — Bilingual (English/Bengali) HTML templates via SMTP with cron-based sweeps
- **Google Meet Integration** — Automatic Meet space creation via stored OAuth refresh tokens
- **Seed Data** — In-memory fallback when no database is configured; seed script for Supabase

## Tech Stack

| Technology | Purpose |
|---|---|
| Express 5 | Web framework |
| Supabase JS | PostgreSQL database client |
| Google Auth Library | OAuth 2.0 + token verification |
| JSON Web Tokens | Session management |
| Nodemailer | SMTP email transport |
| Node-Cron | Scheduled email jobs |
| Multer | File upload handling |
| Nodemon | Dev auto-restart |

## Project Structure

```
src/
├── index.js                 # Entry point + email cron startup
├── app.js                   # Express app factory
├── config/
│   └── env.js               # Environment variable loader
├── lib/
│   ├── supabase.js          # Supabase client singleton
│   ├── session.js           # JWT sign/verify/cookie helpers
│   └── google.js            # Google OAuth flow helpers
├── middleware/
│   └── auth.js              # requireAuth middleware
├── routes/
│   ├── index.js             # Main router
│   ├── auth.routes.js       # Authentication endpoints
│   ├── appointments.routes.js
│   ├── availability.routes.js
│   └── internal.routes.js   # Server-to-server endpoints
├── services/
│   ├── appointments.service.js
│   ├── availability.service.js
│   ├── clients.service.js
│   ├── profile.service.js
│   ├── stats.service.js
│   ├── sessions.service.js
│   ├── meet.service.js
│   ├── mailer.service.js
│   └── appointment-emails.service.js
├── data/
│   └── seed.js              # In-memory seed data
├── utils/
│   └── format.js            # Date/time formatting helpers
└── jobs/
    └── email-cron.js        # Scheduled email sweep jobs

supabase/
└── schema.sql               # Full PostgreSQL schema

scripts/
├── seed.js                  # Supabase seed script
├── test-mail.mjs            # SMTP connection test
└── test-email-sweeps.mjs    # Manual email sweep trigger
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (or use in-memory mode)
- Google Cloud OAuth credentials (optional)
- SMTP server access (optional, for emails)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
CLIENT_ORIGIN=http://localhost:5173

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session
SESSION_SECRET=
SESSION_COOKIE_NAME=aicv_session
SESSION_MAX_AGE_DAYS=7
AUTH_REQUIRED=false

# Supabase (optional — falls back to in-memory seed data)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# SMTP (optional)
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASS=
MAIL_FROM=

# Internal
INTERNAL_API_SECRET=
```

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Seed Database

```bash
npm run seed
```

Populates Supabase with demo consultant, client, and appointment data.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/session` | Get current session |
| GET | `/api/auth/google` | Google OAuth redirect |
| GET | `/api/auth/callback` | OAuth callback handler |
| POST | `/api/auth/demo` | Demo mode sign-in |
| POST | `/api/auth/logout` | Clear session |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profile` | Get consultant profile |
| PATCH | `/api/profile` | Update profile fields |
| POST | `/api/profile/avatar` | Upload profile picture |

### Appointments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/appointments` | List appointments (filter by status) |
| POST | `/api/appointments` | Create appointment |
| PATCH | `/api/appointments/:id` | Update appointment |
| DELETE | `/api/appointments/:id` | Cancel appointment |

### Availability

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/availability` | Get monthly availability |
| POST | `/api/availability/slots` | Add time slot |
| DELETE | `/api/availability/slots/:id` | Remove time slot |
| POST | `/api/availability/holidays` | Toggle holiday |

### Other

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/me` | Current session user |
| GET | `/api/clients` | List clients |
| GET | `/api/clients/:key` | Client detail |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/sessions` | Upcoming sessions |

## Database

Uses **Supabase** (hosted PostgreSQL). The server uses the service role key to bypass Row Level Security (RLS).

### Tables

| Table | Description |
|---|---|
| `profiles` | Consultant profiles |
| `clients` | Registered clients |
| `appointments` | Booking records |
| `availability_slots` | Consultant time slots |
| `holidays` | Marked unavailable days |
| `client_records` | Per-client consultant notes |
| `google_tokens` | OAuth refresh tokens |

When no Supabase credentials are provided, all services fall back to an **in-memory seed store** so the UI works without a database.

## License

This project is private and proprietary.
