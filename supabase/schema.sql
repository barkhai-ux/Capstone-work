-- ============================================================================
-- Supabase schema for the no-code database platform
--
-- Run this once in the Supabase SQL editor for a new project.
-- It is idempotent: safe to re-run.
--
-- Layout:
--   1. user_tables  — per-user metadata mirror of DuckDB tables (used to
--                     re-hydrate the DuckDB file from Storage if the backend
--                     loses its local disk).
--   2. dashboards   — saved dashboards (widgets + layouts), per user.
--   3. snippets     — saved Ask-Data result snippets, per user.
--   4. Storage bucket  user-files  — original uploaded files, per user.
--   5. Row-level security policies so each user only sees their own rows.
-- ============================================================================

-- ── Extensions ──
create extension if not exists "uuid-ossp";

-- ── 1. databases (user-named workspaces that group tables) ──
create table if not exists public.databases (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists databases_user_id_idx on public.databases (user_id);

-- ── 2. user_tables ──
create table if not exists public.user_tables (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  database_id   uuid references public.databases(id) on delete cascade,
  name          text not null,                      -- user-visible table name
  original_file text,                                -- original filename
  storage_path  text,                                -- path in user-files bucket
  row_count     integer default 0,
  column_count  integer default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, name)
);

-- For projects upgrading from the pre-multi-database schema: add the column
-- if it's missing on an existing user_tables table.
alter table public.user_tables
  add column if not exists database_id uuid references public.databases(id) on delete cascade;

create index if not exists user_tables_user_id_idx     on public.user_tables (user_id);
create index if not exists user_tables_database_id_idx on public.user_tables (database_id);

-- ── 2. dashboards ──
create table if not exists public.dashboards (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  widgets     jsonb not null default '[]'::jsonb,
  layouts     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dashboards_user_id_idx on public.dashboards (user_id);

-- ── 3. snippets ──
create table if not exists public.snippets (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  question    text not null,
  columns     jsonb not null,
  rows        jsonb not null,
  row_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists snippets_user_id_idx on public.snippets (user_id);

-- ── 4. updated_at trigger ──
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists databases_set_updated_at on public.databases;
create trigger databases_set_updated_at
  before update on public.databases
  for each row execute function public.set_updated_at();

drop trigger if exists user_tables_set_updated_at on public.user_tables;
create trigger user_tables_set_updated_at
  before update on public.user_tables
  for each row execute function public.set_updated_at();

drop trigger if exists dashboards_set_updated_at on public.dashboards;
create trigger dashboards_set_updated_at
  before update on public.dashboards
  for each row execute function public.set_updated_at();

-- ── 5. Row-level security ──
alter table public.databases   enable row level security;
alter table public.user_tables enable row level security;
alter table public.dashboards  enable row level security;
alter table public.snippets    enable row level security;

-- databases policies
drop policy if exists "databases_owner_select" on public.databases;
create policy "databases_owner_select" on public.databases
  for select using (auth.uid() = user_id);

drop policy if exists "databases_owner_insert" on public.databases;
create policy "databases_owner_insert" on public.databases
  for insert with check (auth.uid() = user_id);

drop policy if exists "databases_owner_update" on public.databases;
create policy "databases_owner_update" on public.databases
  for update using (auth.uid() = user_id);

drop policy if exists "databases_owner_delete" on public.databases;
create policy "databases_owner_delete" on public.databases
  for delete using (auth.uid() = user_id);

-- user_tables policies
drop policy if exists "user_tables_owner_select" on public.user_tables;
create policy "user_tables_owner_select" on public.user_tables
  for select using (auth.uid() = user_id);

drop policy if exists "user_tables_owner_insert" on public.user_tables;
create policy "user_tables_owner_insert" on public.user_tables
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_tables_owner_update" on public.user_tables;
create policy "user_tables_owner_update" on public.user_tables
  for update using (auth.uid() = user_id);

drop policy if exists "user_tables_owner_delete" on public.user_tables;
create policy "user_tables_owner_delete" on public.user_tables
  for delete using (auth.uid() = user_id);

-- dashboards policies
drop policy if exists "dashboards_owner_select" on public.dashboards;
create policy "dashboards_owner_select" on public.dashboards
  for select using (auth.uid() = user_id);

drop policy if exists "dashboards_owner_insert" on public.dashboards;
create policy "dashboards_owner_insert" on public.dashboards
  for insert with check (auth.uid() = user_id);

drop policy if exists "dashboards_owner_update" on public.dashboards;
create policy "dashboards_owner_update" on public.dashboards
  for update using (auth.uid() = user_id);

drop policy if exists "dashboards_owner_delete" on public.dashboards;
create policy "dashboards_owner_delete" on public.dashboards
  for delete using (auth.uid() = user_id);

-- snippets policies
drop policy if exists "snippets_owner_select" on public.snippets;
create policy "snippets_owner_select" on public.snippets
  for select using (auth.uid() = user_id);

drop policy if exists "snippets_owner_insert" on public.snippets;
create policy "snippets_owner_insert" on public.snippets
  for insert with check (auth.uid() = user_id);

drop policy if exists "snippets_owner_delete" on public.snippets;
create policy "snippets_owner_delete" on public.snippets
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Storage bucket for original uploaded files.
--
-- The Supabase SQL editor allows seeding the bucket here. Files are stored
-- under   user-files/<user_id>/<table_id>.<ext>   and policies limit each
-- user to their own folder.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

drop policy if exists "user_files_owner_select" on storage.objects;
create policy "user_files_owner_select" on storage.objects
  for select using (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "user_files_owner_insert" on storage.objects;
create policy "user_files_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "user_files_owner_update" on storage.objects;
create policy "user_files_owner_update" on storage.objects
  for update using (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "user_files_owner_delete" on storage.objects;
create policy "user_files_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
