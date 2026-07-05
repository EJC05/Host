-- HouseKey — Milestone 1: core multi-tenant schema + Row-Level Security
--
-- Tables: profiles, suites, suite_tabs, memberships, plans, rooms, reserved_slugs
-- RPCs:   slug_available, create_suite_with_defaults
--
-- This migration is written to run both on Supabase (as the postgres role via
-- `supabase db push` / `supabase start`) and against a plain Postgres cluster
-- prepared with scripts/supabase-shim.sql (used by the RLS test suite).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.suite_type as enum ('creator', 'community', 'business');
create type public.suite_access as enum ('free', 'paid');
create type public.member_role as enum ('owner', 'member');
create type public.tab_kind as enum ('home', 'rooms', 'about', 'links', 'members', 'contact', 'custom');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created automatically on signup
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- reserved_slugs — slugs that can never be claimed as a suite slug
-- ---------------------------------------------------------------------------

create table public.reserved_slugs (
  slug text primary key,
  reason text
);

insert into public.reserved_slugs (slug, reason) values
  ('admin', 'system'), ('api', 'system'), ('app', 'system'), ('auth', 'system'),
  ('billing', 'system'), ('blog', 'system'), ('dashboard', 'system'), ('docs', 'system'),
  ('help', 'system'), ('housekey', 'brand'), ('login', 'system'), ('logout', 'system'),
  ('new', 'system'), ('privacy', 'system'), ('pricing', 'system'), ('root', 'system'),
  ('s', 'system'), ('settings', 'system'), ('signup', 'system'), ('static', 'system'),
  ('support', 'system'), ('terms', 'system'), ('www', 'system');

-- ---------------------------------------------------------------------------
-- suites — the tenant
-- ---------------------------------------------------------------------------

create table public.suites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique
    check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  name text not null check (char_length(name) between 1 and 80),
  suite_type public.suite_type not null default 'creator',
  access public.suite_access not null default 'free',
  logo_url text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suites_owner_id_idx on public.suites (owner_id);

create trigger suites_updated_at
  before update on public.suites
  for each row execute function public.set_updated_at();

-- Reserved slugs are enforced in the database, not just the UI, so no client
-- can claim one by calling the API directly.
create function public.enforce_slug_not_reserved()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.reserved_slugs r where r.slug = new.slug) then
    raise exception 'slug_reserved: "%" is a reserved slug', new.slug
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger suites_slug_not_reserved
  before insert or update of slug on public.suites
  for each row execute function public.enforce_slug_not_reserved();

-- ---------------------------------------------------------------------------
-- memberships — who belongs to a suite
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (suite_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- plans — access pricing per suite (no Stripe in Milestone 1)
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index plans_suite_id_idx on public.plans (suite_id);

-- ---------------------------------------------------------------------------
-- suite_tabs — navigation tabs of a suite
-- ---------------------------------------------------------------------------

create table public.suite_tabs (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  kind public.tab_kind not null default 'custom',
  position integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index suite_tabs_suite_id_idx on public.suite_tabs (suite_id);

-- ---------------------------------------------------------------------------
-- rooms — community rooms (seeded records only in Milestone 1, no UI)
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index rooms_suite_id_idx on public.rooms (suite_id);

-- ---------------------------------------------------------------------------
-- RLS helper functions
--
-- SECURITY DEFINER so policies on memberships/suite_tabs/rooms can consult
-- suites/memberships without recursive policy evaluation.
-- ---------------------------------------------------------------------------

create function public.is_suite_owner(p_suite_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from suites s
    where s.id = p_suite_id and s.owner_id = auth.uid()
  );
$$;

create function public.is_suite_member(p_suite_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.suite_id = p_suite_id and m.user_id = auth.uid()
  );
$$;

create function public.suite_is_published(p_suite_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from suites s
    where s.id = p_suite_id and s.published
  );
$$;

create function public.suite_is_joinable(p_suite_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from suites s
    where s.id = p_suite_id and s.published and s.access = 'free'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.reserved_slugs enable row level security;
alter table public.suites enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.suite_tabs enable row level security;
alter table public.rooms enable row level security;

-- profiles: you can only see and edit your own profile.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- reserved_slugs: readable by everyone (needed for client-side hints);
-- no write policies — only service_role/migrations may modify.
create policy reserved_slugs_select_all on public.reserved_slugs
  for select to anon, authenticated
  using (true);

-- suites: published suites are public metadata; unpublished only for
-- owner/members. Only the owner may create/update/delete their suite.
create policy suites_select_visible on public.suites
  for select to anon, authenticated
  using (published or owner_id = auth.uid() or public.is_suite_member(id));

create policy suites_insert_own on public.suites
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy suites_update_owner on public.suites
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy suites_delete_owner on public.suites
  for delete to authenticated
  using (owner_id = auth.uid());

-- memberships: you see your own memberships; owners see their suite's roster.
-- Self-join is only allowed into published free suites, as a plain member.
create policy memberships_select_own_or_owner on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_suite_owner(suite_id));

create policy memberships_insert_self_join on public.memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and public.suite_is_joinable(suite_id)
  );

create policy memberships_update_owner on public.memberships
  for update to authenticated
  using (public.is_suite_owner(suite_id))
  with check (public.is_suite_owner(suite_id));

create policy memberships_delete_leave_or_owner on public.memberships
  for delete to authenticated
  using (user_id = auth.uid() or public.is_suite_owner(suite_id));

-- plans: pricing of a published suite is public; owners always see theirs.
create policy plans_select_visible on public.plans
  for select to anon, authenticated
  using (public.suite_is_published(suite_id) or public.is_suite_owner(suite_id));

create policy plans_write_owner on public.plans
  for all to authenticated
  using (public.is_suite_owner(suite_id))
  with check (public.is_suite_owner(suite_id));

-- suite_tabs: public tabs of published suites are visible to everyone;
-- private tabs only to owner/members. Only owners write.
create policy suite_tabs_select_visible on public.suite_tabs
  for select to anon, authenticated
  using (
    (is_public and public.suite_is_published(suite_id))
    or public.is_suite_owner(suite_id)
    or public.is_suite_member(suite_id)
  );

create policy suite_tabs_write_owner on public.suite_tabs
  for all to authenticated
  using (public.is_suite_owner(suite_id))
  with check (public.is_suite_owner(suite_id));

-- rooms: member-only content. Never visible to anon or non-members.
create policy rooms_select_member on public.rooms
  for select to authenticated
  using (public.is_suite_owner(suite_id) or public.is_suite_member(suite_id));

create policy rooms_write_owner on public.rooms
  for all to authenticated
  using (public.is_suite_owner(suite_id))
  with check (public.is_suite_owner(suite_id));

-- ---------------------------------------------------------------------------
-- Grants (RLS gates rows; grants gate verbs)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: slug availability check (used live by the onboarding wizard)
-- ---------------------------------------------------------------------------

create function public.slug_available(p_slug text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_slug is not null
    and p_slug = lower(p_slug)
    and p_slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'
    and not exists (select 1 from reserved_slugs r where r.slug = p_slug)
    and not exists (select 1 from suites s where s.slug = p_slug);
$$;

-- ---------------------------------------------------------------------------
-- RPC: create a suite atomically with owner membership, plan, and
-- template-seeded tabs + rooms.
-- ---------------------------------------------------------------------------

create function public.create_suite_with_defaults(
  p_name text,
  p_slug text,
  p_suite_type public.suite_type,
  p_access public.suite_access,
  p_price_cents integer default null,
  p_logo_url text default null,
  p_brand_color text default null
)
returns public.suites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_suite public.suites;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'invalid_name';
  end if;

  if p_slug is null
     or p_slug <> lower(p_slug)
     or p_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then
    raise exception 'invalid_slug';
  end if;

  if exists (select 1 from reserved_slugs r where r.slug = p_slug) then
    raise exception 'slug_reserved';
  end if;

  if exists (select 1 from suites s where s.slug = p_slug) then
    raise exception 'slug_taken';
  end if;

  if p_access = 'paid' and (p_price_cents is null or p_price_cents < 100 or p_price_cents > 100000000) then
    raise exception 'invalid_price';
  end if;

  insert into suites (owner_id, slug, name, suite_type, access, logo_url, brand_color)
  values (v_user, p_slug, btrim(p_name), p_suite_type, p_access, p_logo_url, p_brand_color)
  returning * into v_suite;

  insert into memberships (suite_id, user_id, role)
  values (v_suite.id, v_user, 'owner');

  if p_access = 'paid' then
    insert into plans (suite_id, name, price_cents)
    values (v_suite.id, 'Membership', p_price_cents);
  else
    insert into plans (suite_id, name, price_cents)
    values (v_suite.id, 'Free', 0);
  end if;

  if p_suite_type = 'creator' then
    insert into suite_tabs (suite_id, title, kind, position, is_public) values
      (v_suite.id, 'Home',  'home',  0, true),
      (v_suite.id, 'Rooms', 'rooms', 1, false),
      (v_suite.id, 'About', 'about', 2, true),
      (v_suite.id, 'Links', 'links', 3, true);
    insert into rooms (suite_id, name, description, position) values
      (v_suite.id, 'General', 'Open discussion for members.', 0),
      (v_suite.id, 'Announcements', 'Updates from the owner.', 1);
  elsif p_suite_type = 'community' then
    insert into suite_tabs (suite_id, title, kind, position, is_public) values
      (v_suite.id, 'Home',    'home',    0, true),
      (v_suite.id, 'Rooms',   'rooms',   1, false),
      (v_suite.id, 'Members', 'members', 2, false),
      (v_suite.id, 'About',   'about',   3, true);
    insert into rooms (suite_id, name, description, position) values
      (v_suite.id, 'General', 'Open discussion for members.', 0),
      (v_suite.id, 'Introductions', 'Say hello and introduce yourself.', 1),
      (v_suite.id, 'Events', 'Upcoming events and meetups.', 2);
  else
    insert into suite_tabs (suite_id, title, kind, position, is_public) values
      (v_suite.id, 'Home',    'home',    0, true),
      (v_suite.id, 'Rooms',   'rooms',   1, false),
      (v_suite.id, 'About',   'about',   2, true),
      (v_suite.id, 'Contact', 'contact', 3, true);
    insert into rooms (suite_id, name, description, position) values
      (v_suite.id, 'General', 'Open discussion for members.', 0),
      (v_suite.id, 'Support', 'Questions and support.', 1);
  end if;

  return v_suite;
end;
$$;

revoke execute on function public.create_suite_with_defaults(text, text, public.suite_type, public.suite_access, integer, text, text) from public;
grant execute on function public.create_suite_with_defaults(text, text, public.suite_type, public.suite_access, integer, text, text) to authenticated;

revoke execute on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
