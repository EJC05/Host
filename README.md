# HouseKey

Multi-tenant SaaS platform: creators, communities, and businesses launch
their own branded member suite at `/s/<slug>`.

**Status: Milestone 3 — Membership & Money.** See
[`docs/housekey-prd.md`](docs/housekey-prd.md) for the product spec, and
`docs/milestone-{1,2,3}.md` for the milestone plans. Room UI, comments,
analytics, tokens, and custom domains are intentionally not built yet.

Stripe setup (test mode): create a $99/month price for the Suite plan
and set `STRIPE_SUITE_PLAN_PRICE_ID`; add webhook endpoints
`/api/webhooks/stripe` (platform events: checkout, subscriptions,
invoices, refunds) and `/api/webhooks/stripe-connect` (account.updated,
"listen to events on connected accounts"); set both signing secrets and
`SUPABASE_SERVICE_ROLE_KEY` — see `.env.example`. For local testing:
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Supabase (Auth, Postgres, RLS, Storage) · pnpm

## Getting started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Set up Supabase**

   Either create a project at [supabase.com](https://supabase.com), or run a
   local stack with the [Supabase CLI](https://supabase.com/docs/guides/cli):

   ```bash
   supabase start          # local stack
   supabase db push        # applies supabase/migrations/
   ```

   For a hosted project, apply the migrations with
   `supabase db push --linked` (or paste them into the SQL editor in order).

3. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from your project's API settings (or from `supabase start` output).

4. **Run**

   ```bash
   pnpm dev
   ```

## Trying the Milestone 1 acceptance flow

1. Sign up as User A → the onboarding wizard creates **Suite A**.
2. In a private window, sign up as User B → create **Suite B**.
3. Visit `/s/suite-a` and `/s/suite-b` (public, works logged out).
4. `/dashboard/suite-a` works only for User A; User B gets a 404.
5. Cross-tenant access is blocked by Row-Level Security regardless of the
   UI — proven by the test suite below.

## Tests

```bash
pnpm test:rls
```

Spins up a throwaway local Postgres cluster (no Docker or Supabase CLI
needed — just Postgres server binaries), emulates the Supabase auth
runtime, applies the production migration, and asserts that cross-tenant
reads and writes fail in both directions. See
[`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql).

## Repository layout

See [`docs/milestone-1.md`](docs/milestone-1.md#2-file--folder-structure).
