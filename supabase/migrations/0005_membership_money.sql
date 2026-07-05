-- HouseKey — Milestone 3: Membership & Money
--
-- Design: Stripe webhooks are the ONLY writer of billing/membership state.
-- Every state transition is a SECURITY DEFINER function executable solely by
-- service_role (the webhook handler's client). Authenticated users lose
-- UPDATE on billing columns entirely via column-level grants, so "the UI
-- cannot mark anyone as paid" is a database guarantee, not a convention.

-- ---------------------------------------------------------------------------
-- suites: SaaS billing (owner pays HouseKey) + Connect payouts
-- ---------------------------------------------------------------------------

alter table public.suites
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column billing_status text not null default 'none'
    check (billing_status in ('none', 'trialing', 'active', 'past_due', 'canceled')),
  add column trial_ends_at timestamptz,
  add column current_period_end timestamptz,
  add column stripe_connect_id text,
  add column connect_ready boolean not null default false;

create index suites_stripe_connect_id_idx on public.suites (stripe_connect_id);

-- ---------------------------------------------------------------------------
-- memberships: paid-subscription state
-- ---------------------------------------------------------------------------

alter table public.memberships
  add column status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled')),
  add column stripe_subscription_id text,
  add column stripe_customer_id text,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

-- ---------------------------------------------------------------------------
-- plans / profiles: Stripe pointers
-- ---------------------------------------------------------------------------

alter table public.plans
  add column stripe_product_id text,
  add column stripe_price_id text,
  add column stripe_price_cents integer;

alter table public.profiles
  add column stripe_customer_id text;

-- ---------------------------------------------------------------------------
-- stripe_events: webhook idempotency ledger. No RLS policies and no grants
-- to anon/authenticated — only service_role (via RPC) touches it.
-- ---------------------------------------------------------------------------

create table public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------------
-- transactions: money movements recorded from webhooks
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null
    check (kind in ('member_payment', 'saas_payment', 'payment_failed', 'refund')),
  amount_cents integer not null,
  currency text not null default 'usd',
  application_fee_cents integer,
  stripe_ref text,
  created_at timestamptz not null default now(),
  unique (kind, stripe_ref)
);

create index transactions_suite_id_idx on public.transactions (suite_id, created_at desc);

alter table public.transactions enable row level security;

-- Owners see their suite's money; a payer sees their own rows. Nobody
-- inserts/updates/deletes through PostgREST roles — webhook RPCs only.
create policy transactions_select_owner_or_payer on public.transactions
  for select to authenticated
  using (public.is_suite_owner(suite_id) or user_id = auth.uid());

grant select on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Column-level write hardening.
--
-- Revoke blanket UPDATE/INSERT and re-grant only safe columns. RLS policies
-- still gate rows; these grants gate columns. Billing and Stripe columns
-- become unwritable for every PostgREST role except service_role.
-- ---------------------------------------------------------------------------

revoke update on public.suites from authenticated;
grant update (name, suite_type, access, logo_url, brand_color, published,
              tagline, about, cover_image_url, accent_color, theme)
  on public.suites to authenticated;

revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;

revoke insert on public.memberships from authenticated;
grant insert (suite_id, user_id, role, tier) on public.memberships to authenticated;

revoke update on public.plans from authenticated;
grant update (name, price_cents, currency, billing_interval, is_active)
  on public.plans to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Suite creation goes through the create_suite_with_defaults RPC, but the
-- plain INSERT path exists too — keep it away from billing columns.
revoke insert on public.suites from authenticated;
grant insert (owner_id, slug, name, suite_type, access, logo_url, brand_color,
              published, tagline, about, cover_image_url, accent_color, theme)
  on public.suites to authenticated;

-- service_role needs standard grants in environments without Supabase's
-- defaults (e.g. the test harness). Harmless on Supabase.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Paid access rule: tier=paid AND a live subscription (grace during
-- past_due dunning, nothing after cancellation). Ex-paid members revert to
-- free members: any membership row still unlocks free_members content.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_post_body(p_post_id uuid)
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
                and m.status in ('active', 'past_due')
            ))
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Webhook state-transition RPCs — service_role ONLY.
-- ---------------------------------------------------------------------------

-- Claims a Stripe event id. Returns true if this is the first delivery,
-- false for a duplicate. release_stripe_event undoes a claim when
-- processing fails so Stripe's retry is not treated as a duplicate.
create function public.record_stripe_event(p_event_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into stripe_events (id, type)
  values (p_event_id, p_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create function public.release_stripe_event(p_event_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from stripe_events where id = p_event_id;
$$;

create function public.apply_owner_billing(
  p_suite_id uuid,
  p_billing_status text,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_trial_ends_at timestamptz default null,
  p_current_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_billing_status not in ('none', 'trialing', 'active', 'past_due', 'canceled') then
    raise exception 'invalid_billing_status';
  end if;
  update suites
  set billing_status = p_billing_status,
      stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
      trial_ends_at = p_trial_ends_at,
      current_period_end = p_current_period_end
  where id = p_suite_id;
end;
$$;

create function public.apply_connect_status(
  p_suite_id uuid,
  p_stripe_connect_id text,
  p_connect_ready boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update suites
  set stripe_connect_id = coalesce(p_stripe_connect_id, stripe_connect_id),
      connect_ready = p_connect_ready
  where id = p_suite_id;
$$;

-- Upserts the membership row. Creates it (role=member) when a paying
-- member was never a free member first.
create function public.apply_member_subscription(
  p_suite_id uuid,
  p_user_id uuid,
  p_tier public.membership_tier,
  p_status text,
  p_stripe_subscription_id text default null,
  p_stripe_customer_id text default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('active', 'past_due', 'canceled') then
    raise exception 'invalid_membership_status';
  end if;
  insert into memberships (suite_id, user_id, role, tier, status,
                           stripe_subscription_id, stripe_customer_id,
                           current_period_end, cancel_at_period_end)
  values (p_suite_id, p_user_id, 'member', p_tier, p_status,
          p_stripe_subscription_id, p_stripe_customer_id,
          p_current_period_end, p_cancel_at_period_end)
  on conflict (suite_id, user_id) do update
  set tier = excluded.tier,
      status = excluded.status,
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, memberships.stripe_subscription_id),
      stripe_customer_id = coalesce(excluded.stripe_customer_id, memberships.stripe_customer_id),
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end;
end;
$$;

-- Records a transaction. Idempotent on (kind, stripe_ref) — a replayed
-- webhook cannot duplicate money records even if the event ledger was
-- bypassed. Returns true when a new row was written.
create function public.record_transaction(
  p_suite_id uuid,
  p_user_id uuid,
  p_kind text,
  p_amount_cents integer,
  p_currency text,
  p_application_fee_cents integer default null,
  p_stripe_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  if p_kind not in ('member_payment', 'saas_payment', 'payment_failed', 'refund') then
    raise exception 'invalid_transaction_kind';
  end if;
  insert into transactions (suite_id, user_id, kind, amount_cents, currency,
                            application_fee_cents, stripe_ref)
  values (p_suite_id, p_user_id, p_kind, p_amount_cents, coalesce(p_currency, 'usd'),
          p_application_fee_cents, p_stripe_ref)
  on conflict (kind, stripe_ref) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Pointer setters used by server actions (owner-initiated flows) that must
-- persist Stripe object ids before any webhook exists. Pointers only —
-- never status/tier/ready flags.
create function public.set_suite_stripe_customer(p_suite_id uuid, p_customer_id text)
returns void
language sql security definer set search_path = public
as $$
  update suites set stripe_customer_id = p_customer_id
  where id = p_suite_id and stripe_customer_id is null;
$$;

create function public.set_suite_connect_account(p_suite_id uuid, p_connect_id text)
returns void
language sql security definer set search_path = public
as $$
  update suites set stripe_connect_id = p_connect_id
  where id = p_suite_id and stripe_connect_id is null;
$$;

create function public.set_profile_stripe_customer(p_user_id uuid, p_customer_id text)
returns void
language sql security definer set search_path = public
as $$
  update profiles set stripe_customer_id = p_customer_id
  where id = p_user_id and stripe_customer_id is null;
$$;

create function public.set_plan_stripe_price(
  p_plan_id uuid, p_product_id text, p_price_id text, p_price_cents integer
)
returns void
language sql security definer set search_path = public
as $$
  update plans
  set stripe_product_id = p_product_id,
      stripe_price_id = p_price_id,
      stripe_price_cents = p_price_cents
  where id = p_plan_id;
$$;

-- Lock all money RPCs to service_role.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'record_stripe_event(text, text)',
    'release_stripe_event(text)',
    'apply_owner_billing(uuid, text, text, text, timestamptz, timestamptz)',
    'apply_connect_status(uuid, text, boolean)',
    'apply_member_subscription(uuid, uuid, public.membership_tier, text, text, text, timestamptz, boolean)',
    'record_transaction(uuid, uuid, text, integer, text, integer, text)',
    'set_suite_stripe_customer(uuid, text)',
    'set_suite_connect_account(uuid, text)',
    'set_profile_stripe_customer(uuid, text)',
    'set_plan_stripe_price(uuid, text, text, integer)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('revoke execute on function public.%s from anon', fn);
    execute format('revoke execute on function public.%s from authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;
