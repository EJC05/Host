-- HouseKey Milestone 2 RLS tests — post visibility & locked bodies.
--
-- Runs AFTER rls.test.sql in the same database and reuses its state:
--   User A (1111…) owns suite-a (free, published)
--   User B (2222…) owns suite-b (paid, published) and is a FREE member of suite-a
--
-- Adds User C (3333…) who becomes a PAID member of suite-a.

\set ON_ERROR_STOP on

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set user_c '33333333-3333-3333-3333-333333333333'
\set user_d '44444444-4444-4444-4444-444444444444'

\set p_public 'aaaaaaaa-0000-0000-0000-000000000001'
\set p_free   'aaaaaaaa-0000-0000-0000-000000000002'
\set p_paid   'aaaaaaaa-0000-0000-0000-000000000003'
\set p_draft  'aaaaaaaa-0000-0000-0000-000000000004'
\set q_paid   'bbbbbbbb-0000-0000-0000-000000000001'

insert into auth.users (id, email) values
  (:'user_c', 'c@example.com'),
  (:'user_d', 'd@example.com');

-- --------------------------------------------------------------------------
-- Owner A creates posts of every visibility in suite-a
-- --------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

insert into public.posts (id, suite_id, author_id, title, excerpt, visibility, status, pinned)
select x.id, s.id, auth.uid(), x.title, x.excerpt, x.visibility::public.post_visibility,
       x.status::public.post_status, x.pinned
from public.suites s,
  (values
    (:'p_public'::uuid, 'Public post',  'Anyone can read this.',       'public',       'published', true),
    (:'p_free'::uuid,   'Members post', 'Join free to read this.',     'free_members', 'published', false),
    (:'p_paid'::uuid,   'Premium post', 'Paid members only.',          'paid_members', 'published', false),
    (:'p_draft'::uuid,  'Draft post',   'Not published yet.',          'public',       'draft',     false)
  ) as x(id, title, excerpt, visibility, status, pinned)
where s.slug = 'suite-a';

insert into public.post_bodies (post_id, body) values
  (:'p_public', 'PUBLIC_BODY'),
  (:'p_free',   'FREE_MEMBERS_BODY'),
  (:'p_paid',   'PAID_MEMBERS_BODY'),
  (:'p_draft',  'DRAFT_BODY');

do $$
begin
  -- published_at trigger stamped published posts, not the draft
  if (select count(*) from public.posts where published_at is not null) <> 3 then
    raise exception 'FAIL: published_at trigger did not stamp published posts';
  end if;
  -- owner sees all 4 teasers and all 4 bodies, including the draft
  if (select count(*) from public.posts) <> 4 then
    raise exception 'FAIL: owner cannot see all own posts';
  end if;
  if (select count(*) from public.post_bodies) <> 4 then
    raise exception 'FAIL: owner cannot read all own bodies (drafts included)';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Owner B creates a paid-members post in suite-b (cross-tenant fixture)
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

insert into public.posts (id, suite_id, author_id, title, excerpt, visibility, status)
select :'q_paid', s.id, auth.uid(), 'Suite B premium', 'Private to Suite B payers.',
       'paid_members', 'published'
from public.suites s where s.slug = 'suite-b';

insert into public.post_bodies (post_id, body) values (:'q_paid', 'SUITE_B_PAID_BODY');

-- --------------------------------------------------------------------------
-- Visitor (anon): public bodies readable, locked bodies return ZERO rows
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', false);
set role anon;

do $$
declare
  n integer;
begin
  -- teasers of all published posts are visible (locked cards need them)
  select count(*) into n from public.posts p
    join public.suites s on s.id = p.suite_id where s.slug = 'suite-a';
  if n <> 3 then
    raise exception 'FAIL: visitor should see 3 published teasers, saw %', n;
  end if;

  -- the draft teaser is invisible
  if exists (select 1 from public.posts where id = 'aaaaaaaa-0000-0000-0000-000000000004') then
    raise exception 'FAIL: LEAK — visitor can see a draft teaser';
  end if;

  -- visitor CAN read the public post body
  if not exists (select 1 from public.post_bodies
                 where post_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'FAIL: visitor cannot read a public post body';
  end if;

  -- visitor CANNOT read locked bodies (free-member, paid-member, draft)
  select count(*) into n from public.post_bodies
    where post_id in ('aaaaaaaa-0000-0000-0000-000000000002',
                      'aaaaaaaa-0000-0000-0000-000000000003',
                      'aaaaaaaa-0000-0000-0000-000000000004');
  if n <> 0 then
    raise exception 'FAIL: LEAK — visitor received % locked post bodies', n;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Free member (B in suite-a): free-member bodies yes, paid-member bodies no
-- --------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

do $$
begin
  if not exists (select 1 from public.post_bodies
                 where post_id = 'aaaaaaaa-0000-0000-0000-000000000002') then
    raise exception 'FAIL: free member cannot read a free-members body';
  end if;
  if exists (select 1 from public.post_bodies
             where post_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'FAIL: LEAK — free member can read a paid-members body';
  end if;
  if exists (select 1 from public.post_bodies
             where post_id = 'aaaaaaaa-0000-0000-0000-000000000004') then
    raise exception 'FAIL: LEAK — free member can read a draft body';
  end if;
  if exists (select 1 from public.posts
             where id = 'aaaaaaaa-0000-0000-0000-000000000004') then
    raise exception 'FAIL: LEAK — free member can see a draft teaser';
  end if;
end;
$$;

-- A free member cannot upgrade their own tier (update policy is owner-only)
do $$
declare
  n integer;
begin
  update public.memberships m set tier = 'paid'
  from public.suites s
  where s.id = m.suite_id and s.slug = 'suite-a' and m.user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — member upgraded their own tier';
  end if;
end;
$$;

-- ...and cannot write posts into a suite they don't own
do $$
begin
  begin
    insert into public.posts (suite_id, author_id, title, visibility, status)
    select id, auth.uid(), 'Evil post', 'public', 'published'
    from public.suites where slug = 'suite-a';
    raise exception 'FAIL: LEAK — non-owner inserted a post into suite-a';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare
  n integer;
begin
  update public.posts set title = 'hacked'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — non-owner updated a suite-a post';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Paid member: C self-joins suite-a (free), owner upgrades C to paid
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', false);

insert into public.memberships (suite_id, user_id, role, tier)
select id, auth.uid(), 'member', 'free' from public.suites where slug = 'suite-a';

-- self-join with tier='paid' must be rejected (user D tries)
select set_config('request.jwt.claims',
  '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', false);

do $$
begin
  begin
    insert into public.memberships (suite_id, user_id, role, tier)
    select id, auth.uid(), 'member', 'paid' from public.suites where slug = 'suite-a';
    raise exception 'FAIL: LEAK — user self-joined with tier=paid';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- owner A upgrades C to paid
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

update public.memberships m set tier = 'paid'
from public.suites s
where s.id = m.suite_id and s.slug = 'suite-a'
  and m.user_id = '33333333-3333-3333-3333-333333333333';

-- paid member C reads free-member AND paid-member bodies
select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', false);

do $$
begin
  if not exists (select 1 from public.post_bodies
                 where post_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'FAIL: paid member cannot read a paid-members body';
  end if;
  if not exists (select 1 from public.post_bodies
                 where post_id = 'aaaaaaaa-0000-0000-0000-000000000002') then
    raise exception 'FAIL: paid member cannot read a free-members body';
  end if;
  -- paid membership in suite-a grants NOTHING in suite-b
  if exists (select 1 from public.post_bodies
             where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: LEAK — suite-a paid member read a suite-b body';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Cross-tenant: owner A gets nothing private from suite-b
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
declare
  n integer;
begin
  -- teaser is public info…
  if not exists (select 1 from public.posts
                 where id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: published teaser of suite-b should be visible';
  end if;
  -- …the body is not
  if exists (select 1 from public.post_bodies
             where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: LEAK — User A read Suite B''s paid post body';
  end if;

  update public.posts set title = 'hacked'
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A updated a Suite B post';
  end if;

  begin
    insert into public.posts (suite_id, author_id, title, visibility, status)
    select id, auth.uid(), 'Evil', 'public', 'published'
    from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — User A inserted a post into Suite B';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'ALL POST RLS TESTS PASSED' as result;
