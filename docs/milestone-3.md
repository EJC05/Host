# HouseKey — Milestone 3: Membership & Money

## 1. Implementation plan

1. **Schema** (`0005_membership_money.sql`): billing/connect columns on
   `suites`, subscription columns + `status` on `memberships`,
   `stripe_events` (idempotency ledger), `transactions`, Stripe pointer
   columns on `plans`/`profiles`, column-level write hardening, and
   `service_role`-only state-transition RPCs.
2. **State machine in the database.** Every billing/membership mutation
   goes through SECURITY DEFINER RPCs executable **only by
   `service_role`** (the webhook handlers). Browsers and server actions
   acting as the user can never write billing state — enforced by
   grants, not convention — which makes the whole G test list provable
   in SQL without Stripe.
3. **Stripe plumbing**: `lib/stripe.ts` (SDK client), `lib/supabase/admin.ts`
   (service-role client), `lib/stripe-webhooks.ts` (event handlers),
   two verified webhook routes.
4. **Owner SaaS billing (A)**: checkout + portal actions, billing page,
   past-due/canceled banner.
5. **Connect Express (B)**: connect/resume onboarding action,
   `account.updated` handling, three payout states on the billing page.
6. **Member checkout (C)**: destination charges with 10% application
   fee; join button goes live only when `connect_ready`; success page
   polls membership state and never writes it.
7. **Cancellation (D)**: `/account/billing` for members + Stripe portal;
   access persists until period end; `subscription.deleted` downgrades.
8. **Transactions & revenue (E)**: recorded from webhooks; revenue
   block on the owner billing page.
9. **Tests (G)**: new `money-rls.test.sql` + updates to the M2 test that
   previously let the owner set tiers (now forbidden — webhooks only).

## 2. Stripe architecture plan

Two money flows, one platform account:

```
Owner → HouseKey    Stripe Billing subscription on the PLATFORM account
                    ($99/mo Suite plan, 14-day trial, card required).
                    Customer stored on suites.stripe_customer_id.

Member → Owner      Stripe Billing subscription on the PLATFORM account
                    with destination charges: transfer_data.destination =
                    suite's Connect Express account,
                    application_fee_percent = 10.
                    Member's customer stored on profiles.stripe_customer_id
                    (one platform customer per user, reused across suites).
```

- **Connect Express** accounts are created per suite
  (`suites.stripe_connect_id`), onboarded via account links.
  `connect_ready = charges_enabled && details_submitted`, set only by
  the `account.updated` webhook.
- **Per-suite member price**: created lazily on the platform account at
  first checkout from `plans.price_cents`; recreated if the owner has
  since changed the price (`plans.stripe_price_cents` remembers the
  amount the Stripe price was created with).
- Subscriptions carry `metadata.kind` (`saas` | `member`) plus
  `suite_id` / `user_id`, so webhook events route unambiguously.
- **Webhooks are the only writer.** Success redirects poll; they never
  mutate. The UI cannot mark anyone paid.

## 3. Database migration plan (0005)

| Table | Change |
| --- | --- |
| `suites` | `stripe_customer_id`, `stripe_subscription_id`, `billing_status` (`none|trialing|active|past_due|canceled`, default `none`), `trial_ends_at`, `current_period_end`, `stripe_connect_id`, `connect_ready` (default false) |
| `memberships` | `status` (`active|past_due|canceled`, default `active`), `stripe_subscription_id`, `stripe_customer_id`, `current_period_end`, `cancel_at_period_end` |
| `plans` | `stripe_product_id`, `stripe_price_id`, `stripe_price_cents` |
| `profiles` | `stripe_customer_id` |
| `stripe_events` (new) | `id` (Stripe event id, PK), `type`, `created_at` — idempotency ledger, invisible to non-service roles |
| `transactions` (new) | suite_id, user_id, `kind` (`member_payment|saas_payment|payment_failed|refund`), amount_cents, currency, application_fee_cents, `stripe_ref`, created_at; `unique (kind, stripe_ref)` |

**Write hardening (column-level grants).** `UPDATE` is revoked and
re-granted per column so authenticated users (owners included) can only
touch content/branding fields:

- `suites`: name, suite_type, access, logo_url, brand_color, published,
  tagline, about, cover_image_url, accent_color, theme — **not**
  billing/connect columns.
- `memberships`: role only — **not** tier/status/stripe columns (INSERT
  likewise limited to suite_id, user_id, role, tier; the self-join
  policy still forces tier='free').
- `plans`: name, price_cents, currency, billing_interval, is_active.
- `profiles`: display_name, avatar_url.

**RPCs (SECURITY DEFINER, EXECUTE granted to `service_role` only):**
`record_stripe_event`, `apply_owner_billing`, `apply_connect_status`,
`apply_member_subscription`, `record_transaction`.

**Access rule change**: `can_read_post_body` paid branch now requires
`tier='paid' AND status IN ('active','past_due')` (grace during Stripe
dunning; nothing after cancellation). Free-member content requires any
membership row — an ex-paid member reverts to a free member.

## 4. Webhook event map

`/api/webhooks/stripe` (platform secret):

| Event | `metadata.kind` | Action |
| --- | --- | --- |
| `checkout.session.completed` | saas | link customer/subscription to suite, apply status from subscription |
| `checkout.session.completed` | member | `apply_member_subscription(tier=paid, status=active, …)` |
| `customer.subscription.created/updated` | saas | `apply_owner_billing` (map trialing/active/past_due/canceled, trial + period end) |
| `customer.subscription.updated` | member | update status, `cancel_at_period_end`, period end |
| `customer.subscription.deleted` | saas | `billing_status = canceled` |
| `customer.subscription.deleted` | member | `tier=free, status=canceled` — paid access ends |
| `invoice.payment_succeeded` | saas/member | `record_transaction` (`saas_payment` / `member_payment` + 10% fee) |
| `invoice.payment_failed` | saas/member | `record_transaction(payment_failed)`; status change arrives via subscription.updated |
| `charge.refunded` | (via invoice→subscription lookup) | `record_transaction(refund)` |

`/api/webhooks/stripe-connect` (connect secret):

| Event | Action |
| --- | --- |
| `account.updated` | `connect_ready = charges_enabled && details_submitted` on the suite (matched by metadata.suite_id, fallback by connect id) |

**Idempotency protocol**: verify signature → claim the event id in
`stripe_events` (`ON CONFLICT DO NOTHING`; already-claimed ⇒ 200 skip)
→ process → on processing failure release the claim and return 500 so
Stripe retries. `transactions` has a uniqueness backstop on
`(kind, stripe_ref)`.

## 5. RLS / security test plan (maps to requirement G)

SQL, against real Postgres (`pnpm test:rls`):

| # | Assertion |
| --- | --- |
| G1 | Free member gets zero rows for a paid post body (existing, retained) |
| G2 | Member reads paid body **only after** `apply_member_subscription` runs as `service_role` — before: zero rows |
| G3 | Member updating their own tier → `insufficient_privilege` (column grant, no longer just 0-rows) |
| G4 | Member inserting a membership with stripe/subscription columns or tier=paid → `insufficient_privilege` |
| G5 | Paid member of Suite A still gets zero rows from Suite B's paid bodies |
| G6 | Owner cannot set `connect_ready`/`billing_status`/`stripe_*` on their own suite or plan → `insufficient_privilege` (checkout server action additionally refuses when `connect_ready = false`) |
| G7 | After `apply_member_subscription(tier=free, status=canceled)` the same member gets zero rows for paid bodies |
| G8 | `record_stripe_event` returns false on second delivery; double `record_transaction` with the same `(kind, stripe_ref)` leaves exactly one row; membership state unchanged by replay |
| + | `authenticated` cannot execute any of the money RPCs; anon/non-owners cannot read `transactions`; owner sees own suite's transactions, payer sees own rows |

## 6. Payment edge cases

- **Duplicate/replayed webhooks** — event-id ledger + transaction
  uniqueness (tested).
- **Out-of-order events** (subscription.updated before
  checkout.session.completed) — `apply_member_subscription` upserts.
- **Processing failure after claim** — claim released, 500 returned,
  Stripe retries.
- **cancel_at_period_end** — status stays `active` until Stripe sends
  `subscription.deleted`, so access persists exactly to period end.
- **past_due** — paid access retained during dunning; revoked on
  cancellation.
- **Owner disconnects/loses Connect readiness** — existing member
  subscriptions keep working (Stripe keeps transferring); new checkouts
  are blocked (`connect_ready` gate).
- **Owner changes plan price after subscribers exist** — existing
  subscriptions stay on the old price; next checkout creates a fresh
  Stripe price (`stripe_price_cents` mismatch detection).
- **Trial without card** — avoided: Checkout collects a card
  (`payment_method_collection` default 'always').
- **Member already paid** — checkout action refuses; join button shows
  member state.
- **Refund after cancellation** — transaction recorded; membership state
  untouched (already canceled).

## 7. Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook handlers' admin client (server-only) |
| `STRIPE_SECRET_KEY` | platform API key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | signature secret for `/api/webhooks/stripe` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | signature secret for `/api/webhooks/stripe-connect` |
| `STRIPE_SUITE_PLAN_PRICE_ID` | the $99/mo Suite plan price (created once in the Stripe dashboard) |
| `NEXT_PUBLIC_APP_URL` | absolute base URL for checkout/portal/onboarding redirects |

## Out of scope (per brief)

Tokens/keys, events, livestreaming, custom domains, full analytics, DMs,
marketplace/discovery, native apps, room expansion, business-tier
features, admin panel, multiple SaaS pricing tiers.
