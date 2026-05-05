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
  created_at             timestamptz not null default now()
);

-- Idempotent column additions for installs that ran schema.sql before these
-- columns existed.
alter table public.babies
  add column if not exists gestational_age_weeks integer,
  add column if not exists gestational_age_days  integer;
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
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists feeds_baby_fed_at_idx
  on public.feeds (baby_id, fed_at desc);

create table if not exists public.diapers (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies(id) on delete cascade,
  occurred_at  timestamptz not null default now(),
  type         text not null check (type in ('pee', 'poop', 'both')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists diapers_baby_occurred_at_idx
  on public.diapers (baby_id, occurred_at desc);

------------------------------------------------------------
-- Row Level Security: any signed-in user can read/write.
-- Restrict who can sign in via Supabase Dashboard > Authentication
-- (turn off public sign-ups, then invite users by email).
------------------------------------------------------------
alter table public.babies  enable row level security;
alter table public.weights enable row level security;
alter table public.feeds   enable row level security;
alter table public.diapers enable row level security;

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

-- Create policies for each table: any authenticated user has full access.
do $$
declare
  t text;
begin
  foreach t in array array['babies', 'weights', 'feeds', 'diapers']
  loop
    execute format('create policy "auth read"   on public.%I for select to authenticated using (true);', t);
    execute format('create policy "auth write"  on public.%I for insert to authenticated with check (true);', t);
    execute format('create policy "auth update" on public.%I for update to authenticated using (true) with check (true);', t);
    execute format('create policy "auth delete" on public.%I for delete to authenticated using (true);', t);
  end loop;
end$$;
