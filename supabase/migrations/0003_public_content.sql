-- HouseKey — Milestone 2: Public Suite & Content
--
-- Adds: posts + post_bodies (split so RLS can gate bodies independently of
-- teasers), suite theming columns, membership tiers.
--
-- Like 0001, this migration runs on Supabase and on the plain-Postgres RLS
-- test harness (scripts/test-rls.sh).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.post_visibility as enum ('public', 'free_members', 'paid_members');
create type public.post_status as enum ('draft', 'published');
create type public.membership_tier as enum ('free', 'paid');

-- ---------------------------------------------------------------------------
-- Suite theming (public suite header)
-- ---------------------------------------------------------------------------

alter table public.suites
  add column tagline text check (tagline is null or char_length(tagline) <= 160),
  add column about text,
  add column cover_image_url text,
  add column accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add column theme text not null default 'light' check (theme in ('light', 'dark'));

-- ---------------------------------------------------------------------------
-- Membership tiers — paid access is granted by the payments flow (M3) or the
-- suite owner; self-join is always tier 'free'.
-- ---------------------------------------------------------------------------

alter table public.memberships
  add column tier public.membership_tier not null default 'free';

drop policy memberships_insert_self_join on public.memberships;

create policy memberships_insert_self_join on public.memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and tier = 'free'
    and public.suite_is_joinable(suite_id)
  );

-- ---------------------------------------------------------------------------
-- posts — teaser-safe fields only. The body is intentionally NOT here: it
-- lives in post_bodies so a locked post's body can never appear in any
-- result set readable by an unauthorized viewer.
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  excerpt text check (excerpt is null or char_length(excerpt) <= 300),
  media jsonb not null default '{}'::jsonb,
  visibility public.post_visibility not null default 'public',
  status public.post_status not null default 'draft',
  pinned boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_suite_feed_idx
  on public.posts (suite_id, status, pinned desc, published_at desc);

create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Stamp published_at the first time a post is published.
create function public.posts_set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger posts_published_at
  before insert or update of status on public.posts
  for each row execute function public.posts_set_published_at();

create table public.post_bodies (
  post_id uuid primary key references public.posts (id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create trigger post_bodies_updated_at
  before update on public.post_bodies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create function public.is_post_suite_owner(p_post_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from posts p
    join suites s on s.id = p.suite_id
    where p.id = p_post_id and s.owner_id = auth.uid()
  );
$$;

-- The single source of truth for who may read a post's body.
create function public.can_read_post_body(p_post_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from posts p
    join suites s on s.id = p.suite_id
    where p.id = p_post_id
      and (
        s.owner_id = auth.uid()
        or (
          p.status = 'published'
          and s.published
          and (
            p.visibility = 'public'
            or (p.visibility = 'free_members' and exists (
              select 1 from memberships m
              where m.suite_id = s.id and m.user_id = auth.uid()
            ))
            or (p.visibility = 'paid_members' and exists (
              select 1 from memberships m
              where m.suite_id = s.id
                and m.user_id = auth.uid()
                and m.tier = 'paid'
            ))
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.post_bodies enable row level security;

-- Teasers: everyone may see published posts of published suites (locked
-- cards need title/excerpt/media/visibility); owners also see drafts.
create policy posts_select_visible on public.posts
  for select to anon, authenticated
  using (
    public.is_suite_owner(suite_id)
    or (status = 'published' and public.suite_is_published(suite_id))
  );

create policy posts_insert_owner on public.posts
  for insert to authenticated
  with check (public.is_suite_owner(suite_id) and author_id = auth.uid());

create policy posts_update_owner on public.posts
  for update to authenticated
  using (public.is_suite_owner(suite_id))
  with check (public.is_suite_owner(suite_id));

create policy posts_delete_owner on public.posts
  for delete to authenticated
  using (public.is_suite_owner(suite_id));

-- Bodies: gated by can_read_post_body — this is the "locked bodies never
-- leave the database" guarantee.
create policy post_bodies_select_permitted on public.post_bodies
  for select to anon, authenticated
  using (public.can_read_post_body(post_id));

create policy post_bodies_write_owner on public.post_bodies
  for all to authenticated
  using (public.is_post_suite_owner(post_id))
  with check (public.is_post_suite_owner(post_id));

-- ---------------------------------------------------------------------------
-- Grants (0001's blanket grants predate these tables)
-- ---------------------------------------------------------------------------

grant select on public.posts, public.post_bodies to anon;
grant select, insert, update, delete on public.posts, public.post_bodies to authenticated;
