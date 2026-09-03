-- Remove consultant (HR) accounts — RUN BY HAND, NOT A MIGRATION
--
-- Deleting a profiles row cascades. As of writing that means:
--   availability_slots  61 rows  (on delete cascade)
--   appointments         6 rows  (cascade / set null)
--   google_tokens        6 rows  (on delete cascade)
--   client_records       1 row   (on delete cascade)
-- There is no undo. Take a backup first (Supabase → Database → Backups).
--
-- Everything below is commented out on purpose. Uncomment ONE block.

-- ---------------------------------------------------------------- 0. LOOK
-- Always run this first and read the output.
select p.email,
       p.full_name,
       p.is_published,
       (select count(*) from availability_slots s where s.consultant_id = p.id) as slots,
       (select count(*) from appointments a      where a.consultant_id = p.id) as appointments
  from profiles p
 order by p.created_at;


-- ------------------------------------------- 1. EVERY consultant account
-- Wipes all 7 profiles and everything hanging off them.
--
-- delete from profiles;


-- --------------------------------- 2. Keep the admins, drop the rest
-- Leaves any profile whose email is in admin_emails.
--
-- delete from profiles p
--  where not exists (
--    select 1 from admin_emails a where lower(a.email) = lower(p.email)
--  );


-- ------------------------------- 3. Only the unpublished / test accounts
-- Keeps the two live mentors, removes the five that were never published.
--
-- delete from profiles where is_published is false;


-- ------------------------------------------------ 4. Named accounts only
-- Safest: list exactly who goes.
--
-- delete from profiles
--  where email in (
--    'mdshahin2528@gmail.com',
--    'mdshahin2530@gmail.com',
--    'spotify11189@gmail.com',
--    'zawadulamanhredoy11189@gmail.com'
--  );


-- ------------------------------------------------------------ AFTERWARDS
-- profiles and users are separate tables. Deleting a consultant profile does
-- NOT delete their client-side account, and does NOT remove admin rights —
-- those live in admin_emails. Drop those separately if you mean to:
--
-- delete from users where email = '...';
-- delete from admin_emails where email = '...';
