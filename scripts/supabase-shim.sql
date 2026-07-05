-- Minimal emulation of the Supabase runtime for plain Postgres, so the
-- production migration + RLS policies can be tested without a Supabase stack.
--
-- Provides: anon / authenticated / service_role roles, the auth schema with
-- auth.users, and auth.uid()/auth.role()/auth.jwt() reading the same
-- request.jwt.claims setting PostgREST uses in production.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role';
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::jsonb;
$$;

grant usage on schema auth to anon, authenticated, service_role;
