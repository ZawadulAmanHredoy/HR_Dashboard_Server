-- Mentor applications + admin role
--
-- "Display on website" used to publish a profile immediately. It now files an
-- application that an admin approves before the profile appears publicly, so
-- is_published becomes a decision the admin owns rather than a self-service
-- switch.
--
-- Idempotent: safe to run more than once.

-- ------------------------------------------------------------------- roles
alter table public.users
  add column if not exists role text not null default 'consultant';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check check (role in ('consultant', 'admin'));
  end if;
end $$;

-- Admins are listed by email, not by user id: an admin may not have signed in
-- yet, so there is no users row to tag. Login reconciles users.role from here.
create table if not exists public.admin_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_emails (email) values
  ('shahin@planpostai.com'),
  ('mhredoy221103@bscse.uiu.ac.bd')
on conflict (email) do nothing;

-- Tag anyone already registered.
update public.users u
   set role = 'admin'
  from public.admin_emails a
 where lower(u.email) = lower(a.email)
   and u.role <> 'admin';

-- ------------------------------------------------------------ applications
alter table public.profiles
  add column if not exists application_status       text not null default 'draft',
  add column if not exists application_submitted_at timestamptz,
  add column if not exists application_reviewed_at  timestamptz,
  add column if not exists application_reviewed_by  text,
  add column if not exists application_note         text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_application_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_application_status_check
      check (application_status in ('draft', 'pending', 'approved', 'rejected'));
  end if;
end $$;

-- Profiles already live were approved under the old self-service rule; mark
-- them so this migration does not pull anybody off the website.
update public.profiles
   set application_status      = 'approved',
       application_reviewed_at = coalesce(application_reviewed_at, now()),
       application_reviewed_by = coalesce(application_reviewed_by, 'migration')
 where is_published is true
   and application_status = 'draft';

create index if not exists profiles_application_status_idx
  on public.profiles (application_status, application_submitted_at);

alter table public.admin_emails enable row level security;
