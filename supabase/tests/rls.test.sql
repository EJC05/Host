-- HouseKey RLS test suite — proves cross-tenant isolation.
--
-- Runs against a database prepared with scripts/supabase-shim.sql +
-- supabase/migrations/0001_init.sql. Executed by scripts/test-rls.sh.
--
-- Scenario (mirrors the Milestone 1 acceptance criteria):
--   * User A signs up and creates Suite A (free, creator template)
--   * User B signs up and creates Suite B (paid, community template)
--   * Both public suite pages work; neither user can read or write the
--     other's private dashboard data (rooms, memberships, plans-write, tabs).

\set ON_ERROR_STOP on

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

-- --------------------------------------------------------------------------
-- Sign up User A and User B (the on_auth_user_created trigger must create
-- their profiles).
-- --------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  (:'user_a', 'a@example.com', '{"display_name": "User A"}'),
  (:'user_b', 'b@example.com', '{"display_name": "User B"}');

do $$
begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FAIL: signup trigger did not create profiles';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- User A creates Suite A
-- --------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

select public.create_suite_with_defaults(
  'Suite A', 'suite-a', 'creator_influencer', 'free');

do $$
begin
  if not exists (select 1 from public.suites where slug = 'suite-a') then
    raise exception 'FAIL: suite-a was not created';
  end if;
  if (select count(*) from public.suite_tabs t
      join public.suites s on s.id = t.suite_id where s.slug = 'suite-a') <> 4 then
    raise exception 'FAIL: suite-a tabs were not seeded';
  end if;
  if (select count(*) from public.rooms r
      join public.suites s on s.id = r.suite_id where s.slug = 'suite-a') <> 2 then
    raise exception 'FAIL: suite-a rooms were not seeded';
  end if;
  if not exists (select 1 from public.memberships m
      join public.suites s on s.id = m.suite_id
      where s.slug = 'suite-a' and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'FAIL: owner membership missing for suite-a';
  end if;
  if (select count(*) from public.plans p
      join public.suites s on s.id = p.suite_id where s.slug = 'suite-a') <> 1 then
    raise exception 'FAIL: default plan missing for suite-a';
  end if;
end;
$$;

-- Reserved slug must be rejected
do $$
begin
  begin
    perform public.create_suite_with_defaults('Nope', 'admin', 'custom', 'free');
    raise exception 'FAIL: reserved slug "admin" was accepted';
  exception
    when others then
      if sqlerrm not like '%slug_reserved%' then raise; end if;
  end;
end;
$$;

-- Duplicate slug must be rejected
do $$
begin
  begin
    perform public.create_suite_with_defaults('Nope', 'suite-a', 'custom', 'free');
    raise exception 'FAIL: duplicate slug "suite-a" was accepted';
  exception
    when others then
      if sqlerrm not like '%slug_taken%' then raise; end if;
  end;
end;
$$;

-- Invalid paid price must be rejected
do $$
begin
  begin
    perform public.create_suite_with_defaults('Nope', 'paid-bad', 'custom', 'paid', 0);
    raise exception 'FAIL: paid suite with 0 price was accepted';
  exception
    when others then
      if sqlerrm not like '%invalid_price%' then raise; end if;
  end;
end;
$$;

-- slug_available reflects reality
do $$
begin
  if public.slug_available('suite-a') then
    raise exception 'FAIL: slug_available returned true for taken slug';
  end if;
  if public.slug_available('admin') then
    raise exception 'FAIL: slug_available returned true for reserved slug';
  end if;
  if public.slug_available('Bad Slug!') then
    raise exception 'FAIL: slug_available returned true for invalid slug';
  end if;
  if not public.slug_available('totally-free-slug') then
    raise exception 'FAIL: slug_available returned false for free slug';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- User B creates Suite B (paid, real-estate-agent template)
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

select public.create_suite_with_defaults(
  'Suite B', 'suite-b', 'real_estate_agent', 'paid', 990);

do $$
begin
  if (select count(*) from public.suite_tabs t
      join public.suites s on s.id = t.suite_id where s.slug = 'suite-b') <> 5 then
    raise exception 'FAIL: suite-b tabs were not seeded per template';
  end if;
  if (select count(*) from public.rooms r
      join public.suites s on s.id = r.suite_id where s.slug = 'suite-b') <> 3 then
    raise exception 'FAIL: suite-b rooms were not seeded';
  end if;
  if not exists (select 1 from public.plans p
      join public.suites s on s.id = p.suite_id
      where s.slug = 'suite-b' and p.price_cents = 990) then
    raise exception 'FAIL: suite-b paid plan missing';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Cross-tenant isolation: acting as User A
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
declare
  n integer;
begin
  -- A sees both published suites' public metadata (that is expected)...
  if (select count(*) from public.suites) <> 2 then
    raise exception 'FAIL: published suites should be visible';
  end if;

  -- ...but A must NOT see Suite B's rooms
  select count(*) into n from public.rooms r
    join public.suites s on s.id = r.suite_id where s.slug = 'suite-b';
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A can read % of Suite B''s rooms', n;
  end if;

  -- A must still see their own rooms
  select count(*) into n from public.rooms r
    join public.suites s on s.id = r.suite_id where s.slug = 'suite-a';
  if n <> 2 then
    raise exception 'FAIL: User A cannot read their own rooms';
  end if;

  -- A must NOT see Suite B's member roster
  select count(*) into n from public.memberships m
    join public.suites s on s.id = m.suite_id where s.slug = 'suite-b';
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A can read Suite B''s memberships';
  end if;

  -- A must NOT see Suite B's private (non-public) tabs
  select count(*) into n from public.suite_tabs t
    join public.suites s on s.id = t.suite_id
    where s.slug = 'suite-b' and not t.is_public;
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A can read Suite B''s private tabs';
  end if;

  -- A must NOT see User B's profile
  select count(*) into n from public.profiles
    where id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A can read User B''s profile';
  end if;
end;
$$;

-- A cannot update Suite B (policy filters the row → 0 rows affected)
do $$
declare
  n integer;
begin
  update public.suites set name = 'hacked' where slug = 'suite-b';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A updated Suite B';
  end if;

  delete from public.suites where slug = 'suite-b';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — User A deleted Suite B';
  end if;
end;
$$;

-- A cannot insert a tab or room into Suite B (with check → error)
do $$
begin
  begin
    insert into public.suite_tabs (suite_id, title, kind, position)
    select id, 'Evil', 'custom', 99 from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — User A inserted a tab into Suite B';
  exception
    when insufficient_privilege then null; -- expected: RLS with-check violation
  end;

  begin
    insert into public.rooms (suite_id, name)
    select id, 'Evil room' from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — User A inserted a room into Suite B';
  exception
    when insufficient_privilege then null;
  end;

  -- A cannot grant themselves an owner membership of Suite B
  begin
    insert into public.memberships (suite_id, user_id, role)
    select id, auth.uid(), 'owner' from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — User A made themselves owner of Suite B';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- --------------------------------------------------------------------------
-- Cross-tenant isolation: acting as User B (symmetric checks)
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

do $$
declare
  n integer;
begin
  select count(*) into n from public.rooms r
    join public.suites s on s.id = r.suite_id where s.slug = 'suite-a';
  if n <> 0 then
    raise exception 'FAIL: LEAK — User B can read Suite A''s rooms';
  end if;

  select count(*) into n from public.memberships m
    join public.suites s on s.id = m.suite_id where s.slug = 'suite-a';
  if n <> 0 then
    raise exception 'FAIL: LEAK — User B can read Suite A''s memberships';
  end if;

  update public.suites set name = 'hacked' where slug = 'suite-a';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: LEAK — User B updated Suite A';
  end if;
end;
$$;

-- B CAN self-join free Suite A as a plain member (allowed by design)...
do $$
begin
  insert into public.memberships (suite_id, user_id, role)
  select id, auth.uid(), 'member' from public.suites where slug = 'suite-a';
end;
$$;

-- ...and afterwards B can read Suite A's rooms as a member
do $$
declare
  n integer;
begin
  select count(*) into n from public.rooms r
    join public.suites s on s.id = r.suite_id where s.slug = 'suite-a';
  if n <> 2 then
    raise exception 'FAIL: member cannot read rooms of a suite they joined';
  end if;
end;
$$;

-- But B still cannot self-join paid suites as bypass (Suite B is B's own;
-- create a hypothetical check: A tries to join paid Suite B)
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
begin
  begin
    insert into public.memberships (suite_id, user_id, role)
    select id, auth.uid(), 'member' from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — User A self-joined paid Suite B without paying';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- --------------------------------------------------------------------------
-- Anonymous visitors: public pages work, private data is invisible
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', false);
set role anon;

do $$
declare
  n integer;
begin
  -- /s/suite-a and /s/suite-b render: published suites + public tabs + plans
  if (select count(*) from public.suites) <> 2 then
    raise exception 'FAIL: anon cannot see published suites';
  end if;
  if (select count(*) from public.suite_tabs where not is_public) <> 0 then
    raise exception 'FAIL: LEAK — anon can see private tabs';
  end if;
  if (select count(*) from public.suite_tabs where is_public) < 4 then
    raise exception 'FAIL: anon cannot see public tabs';
  end if;
  if (select count(*) from public.plans) <> 2 then
    raise exception 'FAIL: anon cannot see published pricing';
  end if;

  -- private data invisible
  if (select count(*) from public.rooms) <> 0 then
    raise exception 'FAIL: LEAK — anon can read rooms';
  end if;
  if (select count(*) from public.memberships) <> 0 then
    raise exception 'FAIL: LEAK — anon can read memberships';
  end if;
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FAIL: LEAK — anon can read profiles';
  end if;
end;
$$;

-- anon cannot create suites
do $$
begin
  begin
    perform public.create_suite_with_defaults('Anon Suite', 'anon-suite', 'custom', 'free');
    raise exception 'FAIL: LEAK — anon created a suite';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'ALL RLS TESTS PASSED' as result;
