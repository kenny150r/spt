-- Run this once in the Supabase SQL editor (Dashboard > SQL editor > New query).
-- It creates the schema and locks data down to authenticated users only.

-- Helpful extension for UUIDs.
create extension if not exists "pgcrypto";

------------------------------------------------------------
-- Tables
------------------------------------------------------------
create table if not exists public.babies (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  sex                    text not null check (sex in ('male', 'female')),
  birthday               date not null,
  gestational_age_weeks  integer check (gestational_age_weeks is null or gestational_age_weeks between 20 and 45),
  gestational_age_days   integer check (gestational_age_days  is null or gestational_age_days  between 0 and 6),
  breast_ml_per_min      numeric(5, 2) check (breast_ml_per_min is null or (breast_ml_per_min > 0 and breast_ml_per_min <= 100)),
  -- "Last X" summary cards on the Log page pulse amber once an entry is
  -- older than these per-baby thresholds (hours). NULL = use the app
  -- default; 0 = never pulse (effectively disabled). Decimal allowed so
  -- "2.5 h" style is possible.
  stale_feed_hours       numeric(5, 2) check (stale_feed_hours   is null or (stale_feed_hours   >= 0 and stale_feed_hours   <= 48)),
  stale_diaper_hours     numeric(5, 2) check (stale_diaper_hours is null or (stale_diaper_hours >= 0 and stale_diaper_hours <= 48)),
  stale_pump_hours       numeric(5, 2) check (stale_pump_hours   is null or (stale_pump_hours   >= 0 and stale_pump_hours   <= 48)),
  created_at             timestamptz not null default now()
);

-- Idempotent column additions for installs that ran schema.sql before these
-- columns existed.
alter table public.babies
  add column if not exists gestational_age_weeks integer,
  add column if not exists gestational_age_days  integer,
  add column if not exists breast_ml_per_min     numeric(5, 2),
  add column if not exists stale_feed_hours      numeric(5, 2),
  add column if not exists stale_diaper_hours    numeric(5, 2),
  add column if not exists stale_pump_hours      numeric(5, 2);
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'babies_ga_weeks_chk'
  ) then
    alter table public.babies add constraint babies_ga_weeks_chk
      check (gestational_age_weeks is null or gestational_age_weeks between 20 and 45);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'babies_ga_days_chk'
  ) then
    alter table public.babies add constraint babies_ga_days_chk
      check (gestational_age_days is null or gestational_age_days between 0 and 6);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'babies_breast_rate_chk'
  ) then
    alter table public.babies add constraint babies_breast_rate_chk
      check (breast_ml_per_min is null or (breast_ml_per_min > 0 and breast_ml_per_min <= 100));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'babies_stale_feed_chk'
  ) then
    alter table public.babies add constraint babies_stale_feed_chk
      check (stale_feed_hours is null or (stale_feed_hours >= 0 and stale_feed_hours <= 48));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'babies_stale_diaper_chk'
  ) then
    alter table public.babies add constraint babies_stale_diaper_chk
      check (stale_diaper_hours is null or (stale_diaper_hours >= 0 and stale_diaper_hours <= 48));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'babies_stale_pump_chk'
  ) then
    alter table public.babies add constraint babies_stale_pump_chk
      check (stale_pump_hours is null or (stale_pump_hours >= 0 and stale_pump_hours <= 48));
  end if;
end $$;

create table if not exists public.weights (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies(id) on delete cascade,
  measured_at  timestamptz not null default now(),
  weight_kg    numeric(6, 3) not null check (weight_kg > 0),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists weights_baby_measured_at_idx
  on public.weights (baby_id, measured_at desc);

create table if not exists public.feeds (
  id            uuid primary key default gen_random_uuid(),
  baby_id       uuid not null references public.babies(id) on delete cascade,
  fed_at        timestamptz not null default now(),
  type          text not null check (type in ('breast', 'bottle')),
  amount_ml     numeric(6, 1) check (amount_ml is null or amount_ml >= 0),
  duration_min  numeric(5, 1) check (duration_min is null or duration_min >= 0),
  side          text check (side is null or side in ('left', 'right', 'both')),
  -- Per-side breastfeeding durations; only populated for side='both'
  -- sessions where each breast was timed separately. When null on a
  -- 'both' row, callers fall back to splitting duration_min 50/50,
  -- mirroring how pumps handle left_ml/right_ml.
  left_min      numeric(5, 1) check (left_min  is null or left_min  >= 0),
  right_min     numeric(5, 1) check (right_min is null or right_min >= 0),
  iron          boolean not null default false,
  multivitamin  boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists feeds_baby_fed_at_idx
  on public.feeds (baby_id, fed_at desc);

-- Idempotent column additions for installs that ran schema.sql before these
-- columns existed.
alter table public.feeds
  add column if not exists iron         boolean not null default false,
  add column if not exists multivitamin boolean not null default false,
  add column if not exists left_min     numeric(5, 1),
  add column if not exists right_min    numeric(5, 1);
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'feeds_left_min_chk'
  ) then
    alter table public.feeds add constraint feeds_left_min_chk
      check (left_min is null or left_min >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'feeds_right_min_chk'
  ) then
    alter table public.feeds add constraint feeds_right_min_chk
      check (right_min is null or right_min >= 0);
  end if;
end $$;

create table if not exists public.diapers (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies(id) on delete cascade,
  occurred_at  timestamptz not null default now(),
  type         text not null check (type in ('pee', 'poop', 'both')),
  -- Optional stool size; only meaningful for type in ('poop', 'both').
  size         text check (size is null or size in ('small', 'medium', 'large')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists diapers_baby_occurred_at_idx
  on public.diapers (baby_id, occurred_at desc);

-- Idempotent: add size column + check constraint for installs that ran the
-- older diapers schema.
alter table public.diapers
  add column if not exists size text;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'diapers_size_chk'
  ) then
    alter table public.diapers add constraint diapers_size_chk
      check (size is null or size in ('small', 'medium', 'large'));
  end if;
end $$;

create table if not exists public.pumps (
  id            uuid primary key default gen_random_uuid(),
  baby_id       uuid not null references public.babies(id) on delete cascade,
  pumped_at     timestamptz not null default now(),
  side          text not null check (side in ('left', 'right', 'both')),
  amount_ml     numeric(6, 1) check (amount_ml is null or amount_ml >= 0),
  -- Per-side amounts populated when side='both' AND the user logged each
  -- breast separately (or when the bulk importer parsed "L: X mL · R: Y mL"
  -- out of free-form notes). Null otherwise; chart code falls back to a
  -- 50/50 split for those rows.
  left_ml       numeric(6, 1) check (left_ml  is null or left_ml  >= 0),
  right_ml      numeric(6, 1) check (right_ml is null or right_ml >= 0),
  duration_min  numeric(5, 1) check (duration_min is null or duration_min >= 0),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists pumps_baby_pumped_at_idx
  on public.pumps (baby_id, pumped_at desc);

-- Idempotent column additions for installs that ran the older pumps schema.
alter table public.pumps
  add column if not exists left_ml  numeric(6, 1),
  add column if not exists right_ml numeric(6, 1);
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'pumps_left_ml_chk'
  ) then
    alter table public.pumps add constraint pumps_left_ml_chk
      check (left_ml is null or left_ml >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'pumps_right_ml_chk'
  ) then
    alter table public.pumps add constraint pumps_right_ml_chk
      check (right_ml is null or right_ml >= 0);
  end if;
end $$;

-- Backfill: any existing pump row whose notes look like "L: 40 mL · R: 50 mL"
-- (the format the form used before left_ml/right_ml columns existed) gets the
-- numbers lifted into the new columns. Safe to re-run; only rows that don't
-- already have left_ml/right_ml set are touched.
update public.pumps
set
  left_ml  = (regexp_match(notes, 'L:\s*(\d+(?:\.\d+)?)\s*mL', 'i'))[1]::numeric,
  right_ml = (regexp_match(notes, 'R:\s*(\d+(?:\.\d+)?)\s*mL', 'i'))[1]::numeric
where left_ml is null
  and right_ml is null
  and notes ~* 'L:\s*\d+(?:\.\d+)?\s*mL.*R:\s*\d+(?:\.\d+)?\s*mL';

create table if not exists public.supplements (
  id            uuid primary key default gen_random_uuid(),
  baby_id       uuid not null references public.babies(id) on delete cascade,
  given_at      timestamptz not null default now(),
  multivitamin  boolean not null default false,
  iron          boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  -- An entry must mark at least one supplement.
  constraint supplements_at_least_one_chk
    check (multivitamin or iron)
);
create index if not exists supplements_baby_given_at_idx
  on public.supplements (baby_id, given_at desc);

create table if not exists public.sleeps (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references public.babies(id) on delete cascade,
  started_at  timestamptz not null default now(),
  -- NULL while the baby is still asleep ("ongoing"); set when they wake.
  ended_at    timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint sleeps_interval_chk check (ended_at is null or ended_at >= started_at)
);
create index if not exists sleeps_baby_started_at_idx
  on public.sleeps (baby_id, started_at desc);

------------------------------------------------------------
-- Row Level Security: any signed-in user can read/write.
-- Restrict who can sign in via Supabase Dashboard > Authentication
-- (turn off public sign-ups, then invite users by email).
------------------------------------------------------------
alter table public.babies      enable row level security;
alter table public.weights     enable row level security;
alter table public.feeds       enable row level security;
alter table public.diapers     enable row level security;
alter table public.pumps       enable row level security;
alter table public.supplements enable row level security;
alter table public.sleeps      enable row level security;

-- Drop existing policies first so the script is idempotent.
drop policy if exists "auth read"   on public.babies;
drop policy if exists "auth write"  on public.babies;
drop policy if exists "auth update" on public.babies;
drop policy if exists "auth delete" on public.babies;

drop policy if exists "auth read"   on public.weights;
drop policy if exists "auth write"  on public.weights;
drop policy if exists "auth update" on public.weights;
drop policy if exists "auth delete" on public.weights;

drop policy if exists "auth read"   on public.feeds;
drop policy if exists "auth write"  on public.feeds;
drop policy if exists "auth update" on public.feeds;
drop policy if exists "auth delete" on public.feeds;

drop policy if exists "auth read"   on public.diapers;
drop policy if exists "auth write"  on public.diapers;
drop policy if exists "auth update" on public.diapers;
drop policy if exists "auth delete" on public.diapers;

drop policy if exists "auth read"   on public.pumps;
drop policy if exists "auth write"  on public.pumps;
drop policy if exists "auth update" on public.pumps;
drop policy if exists "auth delete" on public.pumps;

drop policy if exists "auth read"   on public.supplements;
drop policy if exists "auth write"  on public.supplements;
drop policy if exists "auth update" on public.supplements;
drop policy if exists "auth delete" on public.supplements;

drop policy if exists "auth read"   on public.sleeps;
drop policy if exists "auth write"  on public.sleeps;
drop policy if exists "auth update" on public.sleeps;
drop policy if exists "auth delete" on public.sleeps;

-- Create policies for each table: any authenticated user has full access.
do $$
declare
  t text;
begin
  foreach t in array array['babies', 'weights', 'feeds', 'diapers', 'pumps', 'supplements', 'sleeps']
  loop
    execute format('create policy "auth read"   on public.%I for select to authenticated using (true);', t);
    execute format('create policy "auth write"  on public.%I for insert to authenticated with check (true);', t);
    execute format('create policy "auth update" on public.%I for update to authenticated using (true) with check (true);', t);
    execute format('create policy "auth delete" on public.%I for delete to authenticated using (true);', t);
  end loop;
end$$;
