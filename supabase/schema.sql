-- AI CV Maker — consultant console schema
-- Run this in the Supabase SQL editor (or `supabase db execute -f schema.sql`),
-- then populate demo rows with `npm run seed` from the server folder.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
-- One row per signed-in consultant. `id` IS the Google account id (the `sub`
-- claim), so a row appears the first time someone signs in (the API creates it).
-- Supabase Auth is not used — Express owns the OAuth flow and the session.
create table if not exists profiles (
  id          text primary key,
  full_name   text not null,
  short_name  text,
  role        text not null default 'Career Consultant',
  email       text not null,
  phone       text,
  timezone    text not null default 'GMT+6',
  bio         text,
  skills      text[] not null default '{}',
  avatar_url  text,
  provider    text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- clients
create table if not exists clients (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  email       text not null,
  package     text not null default 'Basic' check (package in ('Basic', 'Pro', 'Enterprise')),
  sessions    integer not null default 0,
  last_seen   date,
  status      text not null default 'Active' check (status in ('Active', 'Pending', 'Closed')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ appointments
create table if not exists appointments (
  id               text primary key default gen_random_uuid()::text,
  appointment_date date not null,
  start_time       time not null,
  end_time         time not null,
  client_name      text not null,
  issue            text not null,
  has_documents    boolean not null default false,
  status           text not null default 'upcoming' check (status in ('upcoming', 'past', 'cancelled')),
  mode             text not null default 'Online' check (mode in ('Online', 'In person')),
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists appointments_date_idx on appointments (appointment_date, start_time);
create index if not exists appointments_status_idx on appointments (status);

-- ------------------------------------------------------ availability slots
create table if not exists availability_slots (
  id               text primary key default gen_random_uuid()::text,
  slot_date        date not null,
  start_time       time not null,
  duration_minutes integer not null default 60,
  mode             text not null default 'Online' check (mode in ('Online', 'In person')),
  created_at       timestamptz not null default now(),
  unique (slot_date, start_time)
);

create index if not exists availability_slots_date_idx on availability_slots (slot_date);

-- ---------------------------------------------------------------- holidays
create table if not exists holidays (
  id           text primary key default gen_random_uuid()::text,
  holiday_date date not null unique,
  label        text not null default 'Holiday'
);

-- -------------------------------------------------------- consult sessions
create table if not exists consult_sessions (
  id           text primary key default gen_random_uuid()::text,
  session_date date not null,
  start_time   time not null,
  end_time     time not null,
  mode         text not null default 'Online' check (mode in ('Online', 'In person')),
  client_id    text references clients (id) on delete set null
);

create index if not exists consult_sessions_date_idx on consult_sessions (session_date, start_time);

-- --------------------------------------------------------- consult metrics
create table if not exists consult_metrics (
  id              text primary key default gen_random_uuid()::text,
  total_consults  integer not null default 0,
  hours_delivered numeric(6, 1) not null default 0,
  avg_rating      numeric(2, 1) not null default 0,
  review_count    integer not null default 0,
  repeat_rate     integer not null default 0,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------- RLS
-- The Express server talks to Supabase with the service role key, which bypasses
-- RLS. Keep RLS on so the anon key (shipped in the browser bundle) cannot read
-- these tables directly.
alter table profiles           enable row level security;
alter table clients            enable row level security;
alter table appointments       enable row level security;
alter table availability_slots enable row level security;
alter table holidays           enable row level security;
alter table consult_sessions   enable row level security;
alter table consult_metrics    enable row level security;

-- With RLS on and no policies, only the service role key (the Express server)
-- can touch these tables — which is exactly what we want: the browser never
-- talks to Postgres directly, it goes through the API and its session cookie.

-- NOTE: appointments / availability / clients are still shared across all
-- consultants. Add a `consultant_id text references profiles (id)` column and
-- scope the service queries by `req.user.id` when the console goes
-- multi-consultant.

-- ---------------------------------------------------------------------------
-- BOOKING CORE (Phase 2) — required AFTER this file on any fresh project.
-- Canonical copy (idempotent, keep up to date there):
--   smart-cv-client/supabase/migrations/2026-08-24_booking_core.sql
-- Adds: mentor fields on profiles, consultant scoping, appointments.client_user_id
-- + slot_id + starts_at/ends_at + reminder stamps, double-booking unique index,
-- and the race-safe book_slot() function both apps call.
--
-- TENANCY (run after booking core):
--   smart-cv-client/supabase/migrations/2026-08-24_scope_appointments_to_consultant.sql
-- Backfills appointments.consultant_id and indexes the scoped reads. The API
-- filters every consultant-facing query by consultant_id, so rows left NULL
-- there are visible to nobody.
