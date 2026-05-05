-- Dashboard share tokens.
-- One row per shared dashboard. Token is the public, URL-safe identifier.
-- owner_database_id is captured at share time so public requests can hit the
-- right per-user DuckDB scope without trusting the visitor's headers.

create table if not exists dashboard_shares (
  dashboard_id uuid primary key references dashboards(id) on delete cascade,
  owner_user_id uuid not null,
  owner_database_id uuid not null,
  token text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_shares_token_idx on dashboard_shares(token);
create index if not exists dashboard_shares_owner_idx on dashboard_shares(owner_user_id);
