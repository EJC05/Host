-- HouseKey Milestone 3 RLS tests — billing state machine & money security.
--
-- Runs AFTER posts-rls.test.sql in the same database. Existing state:
--   User A (1111…) owns suite-a; free member of nothing else
--   User B (2222…) owns suite-b (paid, published, connect NOT ready);
--                   free member of suite-a
--   User C (3333…) paid member of suite-a (upgraded via service_role)
--   suite-b has a published paid_members post q_paid (bbbbbbbb-…-0001)
--     whose body is SUITE_B_PAID_BODY

\set ON_ERROR_STOP on

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set q_paid 'bbbbbbbb-0000-0000-0000-000000000001'

-- --------------------------------------------------------------------------
-- G6 — Owner cannot flip money columns on their own suite or plan.
-- connect_ready/billing_status/stripe_* are not UPDATE-grantable to
-- authenticated; only the webhook path (service_role) writes them.
-- --------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

do $$
begin
  begin
    update public.suites set connect_ready = true where slug = 'suite-b';
    raise exception 'FAIL: LEAK — owner set connect_ready on their own suite';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.suites set billing_status = 'active' where slug = 'suite-b';
    raise exception 'FAIL: LEAK — owner set billing_status directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.suites set stripe_connect_id = 'acct_fake' where slug = 'suite-b';
    raise exception 'FAIL: LEAK — owner set stripe_connect_id directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.plans p set stripe_price_id = 'price_fake'
    from public.suites s where s.id = p.suite_id and s.slug = 'suite-b';
    raise exception 'FAIL: LEAK — owner set a plan''s stripe_price_id directly';
  exception when insufficient_privilege then null;
  end;

  -- content columns still work for the owner
  update public.suites set tagline = 'Suite B — premium homes' where slug = 'suite-b';
end;
$$;

-- --------------------------------------------------------------------------
-- Authenticated users cannot execute any money RPC
-- --------------------------------------------------------------------------

do $$
begin
  begin
    perform public.record_stripe_event('evt_forged', 'x');
    raise exception 'FAIL: LEAK — authenticated executed record_stripe_event';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.apply_member_subscription(
      (select id from public.suites where slug = 'suite-b'),
      auth.uid(), 'paid', 'active');
    raise exception 'FAIL: LEAK — authenticated executed apply_member_subscription';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.apply_connect_status(
      (select id from public.suites where slug = 'suite-b'), 'acct_forged', true);
    raise exception 'FAIL: LEAK — authenticated executed apply_connect_status';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.record_transaction(
      (select id from public.suites where slug = 'suite-b'),
      auth.uid(), 'member_payment', 990, 'usd', 99, 'in_forged');
    raise exception 'FAIL: LEAK — authenticated executed record_transaction';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- --------------------------------------------------------------------------
-- G4 — A member cannot write stripe/subscription columns on their own
-- membership row (insert is column-limited; tier=paid is policy-blocked).
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
begin
  begin
    insert into public.memberships (suite_id, user_id, role, tier, stripe_subscription_id)
    select id, auth.uid(), 'member', 'free', 'sub_forged'
    from public.suites where slug = 'suite-b';
    raise exception 'FAIL: LEAK — member inserted a stripe_subscription_id';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.memberships m set status = 'active'
    from public.suites s
    where s.id = m.suite_id and s.slug = 'suite-a' and m.user_id = auth.uid();
    raise exception 'FAIL: LEAK — user updated membership status directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- --------------------------------------------------------------------------
-- G2 — Paid access arrives ONLY via the webhook path.
-- Before: A (not a member of suite-b) gets zero rows for q_paid's body.
-- --------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.post_bodies
             where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: LEAK — non-member read a paid body before payment';
  end if;
end;
$$;

-- Webhook path: simulate checkout.session.completed for A on suite-b.
reset role;
set role service_role;

do $$
declare
  v_suite uuid := (select id from public.suites where slug = 'suite-b');
  v_first boolean;
  v_dup boolean;
  v_tx_first boolean;
  v_tx_dup boolean;
begin
  -- G8a: event ledger — first delivery claims, replay is rejected
  v_first := public.record_stripe_event('evt_checkout_1', 'checkout.session.completed');
  v_dup   := public.record_stripe_event('evt_checkout_1', 'checkout.session.completed');
  if not v_first or v_dup then
    raise exception 'FAIL: stripe event idempotency broken (first=%, dup=%)', v_first, v_dup;
  end if;

  perform public.apply_member_subscription(
    v_suite, '11111111-1111-1111-1111-111111111111',
    'paid', 'active', 'sub_a_on_b', 'cus_a', now() + interval '30 days', false);

  -- G8b: transaction uniqueness — replayed invoice writes exactly one row
  v_tx_first := public.record_transaction(
    v_suite, '11111111-1111-1111-1111-111111111111',
    'member_payment', 990, 'usd', 99, 'in_test_1');
  v_tx_dup := public.record_transaction(
    v_suite, '11111111-1111-1111-1111-111111111111',
    'member_payment', 990, 'usd', 99, 'in_test_1');
  if not v_tx_first or v_tx_dup then
    raise exception 'FAIL: transaction idempotency broken';
  end if;
  if (select count(*) from public.transactions where stripe_ref = 'in_test_1') <> 1 then
    raise exception 'FAIL: duplicate webhook duplicated a transaction';
  end if;

  -- replaying the subscription state is harmless (upsert converges)
  perform public.apply_member_subscription(
    v_suite, '11111111-1111-1111-1111-111111111111',
    'paid', 'active', 'sub_a_on_b', 'cus_a', now() + interval '30 days', false);
  if (select count(*) from public.memberships m
      where m.suite_id = v_suite
        and m.user_id = '11111111-1111-1111-1111-111111111111') <> 1 then
    raise exception 'FAIL: webhook replay duplicated a membership row';
  end if;
end;
$$;

reset role;

-- After the webhook: A reads suite-b's paid body
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
begin
  if not exists (select 1 from public.post_bodies
                 where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: paid member (via webhook) cannot read the paid body';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- G5 — Paid membership in one suite grants nothing elsewhere: B is a FREE
-- member of suite-a and, despite owning paid memberships machinery on
-- suite-b, still cannot read suite-a's paid post.
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', false);

do $$
begin
  if exists (select 1 from public.post_bodies
             where post_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'FAIL: LEAK — cross-suite paid access';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Transactions visibility: owner and payer only
-- --------------------------------------------------------------------------

do $$ -- B owns suite-b: sees its transactions
begin
  if (select count(*) from public.transactions where stripe_ref = 'in_test_1') <> 1 then
    raise exception 'FAIL: owner cannot see their suite''s transactions';
  end if;
end;
$$;

select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', false);

do $$ -- C is neither owner nor payer for suite-b
begin
  if (select count(*) from public.transactions) <> 0 then
    raise exception 'FAIL: LEAK — unrelated user can read transactions';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role": "anon"}', false);
set role anon;

do $$
begin
  if (select count(*) from public.transactions) <> 0 then
    raise exception 'FAIL: LEAK — anon can read transactions';
  end if;
  if (select count(*) from public.stripe_events) <> 0 then
    raise exception 'FAIL: LEAK — anon can read the stripe event ledger';
  end if;
exception
  when insufficient_privilege then null; -- no grant at all is equally fine
end;
$$;

-- --------------------------------------------------------------------------
-- G7 — Cancellation: subscription ends → tier=free/status=canceled →
-- paid access revoked; free-member content stays (they remain a member).
-- --------------------------------------------------------------------------

reset role;
set role service_role;
select public.record_stripe_event('evt_sub_deleted_1', 'customer.subscription.deleted');
select public.apply_member_subscription(
  (select id from public.suites where slug = 'suite-b'),
  '11111111-1111-1111-1111-111111111111',
  'free', 'canceled', 'sub_a_on_b', 'cus_a', null, false);
reset role;

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
begin
  if exists (select 1 from public.post_bodies
             where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: LEAK — canceled member still reads the paid body';
  end if;
end;
$$;

-- past_due keeps paid access (dunning grace), canceled does not
reset role;
set role service_role;
select public.apply_member_subscription(
  (select id from public.suites where slug = 'suite-b'),
  '11111111-1111-1111-1111-111111111111',
  'paid', 'past_due', 'sub_a_on_b', 'cus_a', now() + interval '5 days', false);
reset role;

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', false);

do $$
begin
  if not exists (select 1 from public.post_bodies
                 where post_id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'FAIL: past_due member lost access during dunning grace';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Owner billing state machine (SaaS plan) via webhook path
-- --------------------------------------------------------------------------

reset role;
set role service_role;

do $$
declare
  v_suite uuid := (select id from public.suites where slug = 'suite-a');
begin
  perform public.apply_owner_billing(v_suite, 'trialing', 'cus_owner_a', 'sub_saas_a',
                                     now() + interval '14 days', now() + interval '14 days');
  if (select billing_status from public.suites where id = v_suite) <> 'trialing' then
    raise exception 'FAIL: billing_status not trialing';
  end if;

  perform public.apply_owner_billing(v_suite, 'active', null, null, null,
                                     now() + interval '30 days');
  if (select billing_status from public.suites where id = v_suite) <> 'active' then
    raise exception 'FAIL: billing_status not active';
  end if;
  -- coalesce kept the pointers
  if (select stripe_customer_id from public.suites where id = v_suite) <> 'cus_owner_a' then
    raise exception 'FAIL: apply_owner_billing dropped the customer pointer';
  end if;

  perform public.apply_owner_billing(v_suite, 'past_due');
  perform public.apply_owner_billing(v_suite, 'canceled');
  if (select billing_status from public.suites where id = v_suite) <> 'canceled' then
    raise exception 'FAIL: billing_status not canceled';
  end if;

  perform public.record_transaction(v_suite, null, 'saas_payment', 9900, 'usd', null, 'in_saas_1');

  -- connect readiness via webhook
  perform public.apply_connect_status(
    (select id from public.suites where slug = 'suite-b'), 'acct_b', true);
  if not (select connect_ready from public.suites where slug = 'suite-b') then
    raise exception 'FAIL: connect_ready not set by webhook path';
  end if;
end;
$$;

reset role;

select 'ALL MONEY RLS TESTS PASSED' as result;
