# HouseKey — Milestone 1: Skeleton & Tenancy

> **Note on the PRD:** no PRD document was present in this repository when
> Milestone 1 was first built, so the initial data model was derived from
> the Milestone 1 brief. The PRD has since been added as
> [`housekey-prd.md`](housekey-prd.md) and the implementation reconciled
> against it — see
> [`milestone-1-reconciliation.md`](milestone-1-reconciliation.md).

## 1. Project setup plan

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui (new-york, neutral) |
| Auth & DB | Supabase (Auth, Postgres, RLS, Storage) |
| Data access | `@supabase/ssr` server/browser clients + one SECURITY DEFINER RPC |
| Package manager | pnpm |
| Tests | SQL-level RLS suite against a throwaway local Postgres |

Notes:

- The shadcn/ui registry (`ui.shadcn.com`) was unreachable from the build
  environment, so the standard component files (`button`, `input`, `label`,
  `card`) are vendored by hand with the usual dependencies
  (`class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/*`).
  Future components can be added with `pnpm dlx shadcn@latest add <name>`.
- Suite creation goes through a single Postgres function
  (`create_suite_with_defaults`) so suite + owner membership + plan +
  seeded tabs/rooms are atomic — no half-created tenants.

## 2. File / folder structure

```
app/
  page.tsx                    # marketing home
  layout.tsx                  # root layout (fonts, metadata)
  (auth)/
    layout.tsx                # centered auth shell
    login/page.tsx            # login form
    signup/page.tsx           # signup form
  auth/
    callback/route.ts         # Supabase PKCE/email-confirm redirect target
    actions.ts                # signOut server action
  new/
    page.tsx                  # onboarding entry (auth required)
    actions.ts                # checkSlugAction, createSuiteAction
  dashboard/
    page.tsx                  # redirects to first owned suite or /new
    [slug]/page.tsx           # owner dashboard (private data)
  s/
    [slug]/page.tsx           # public suite page (anon-friendly)
components/
  ui/                         # shadcn/ui primitives
  onboarding/wizard.tsx       # 5-step suite creation wizard
lib/
  supabase/{client,server,middleware}.ts
  types.ts                    # row types for the public schema
  validation.ts               # slug rules, suite type catalog, price bounds
middleware.ts                 # session refresh + protects /dashboard, /new
supabase/
  config.toml
  migrations/
    0001_init.sql             # schema + RLS + RPCs
    0002_storage_branding.sql # branding bucket + storage policies
  tests/rls.test.sql          # cross-tenant isolation proof
scripts/
  supabase-shim.sql           # emulates Supabase auth/roles on plain Postgres
  test-rls.sh                 # spins up throwaway Postgres, runs the suite
docs/milestone-1.md           # this document
```

## 3. Database schema (see `supabase/migrations/0001_init.sql`)

- `profiles` — 1:1 with `auth.users`, auto-created by trigger on signup.
- `suites` — the tenant. Owner, unique slug (checked against
  `reserved_slugs` by trigger), name, `suite_type` (launch template:
  `real_estate_agent | creator_influencer | coach_consultant |
  business_brand | custom` — see PRD §4), `access` (`free | paid`),
  branding (`logo_url`, `brand_color`), `published`.
- `suite_tabs` — navigation tabs, `is_public` controls anon visibility.
- `memberships` — `(suite_id, user_id)` unique, role `owner | member`.
- `plans` — per-suite pricing (`price_cents`, currency, interval). No
  Stripe fields yet.
- `rooms` — member-only community rooms (seeded records only; no UI yet).
- `reserved_slugs` — system-reserved slugs, enforced by a DB trigger so no
  API client can bypass the check.

RPCs:

- `slug_available(text)` — used by the wizard's live availability check.
- `create_suite_with_defaults(...)` — SECURITY DEFINER; validates,
  creates suite + owner membership + plan, seeds tabs and rooms per
  template type. Grantable to `authenticated` only.

## 4. RLS policy plan

Principles: RLS is the enforcement layer (the app's owner checks are
convenience/UX only); every table has RLS enabled; helper functions are
SECURITY DEFINER to avoid recursive policy evaluation; grants gate verbs,
policies gate rows.

| Table | anon | authenticated non-member | member | owner |
| --- | --- | --- | --- | --- |
| suites | read published | read published | read | full |
| suite_tabs | read public tabs of published suites | same | read all | full |
| plans | read (published suites) | same | read | full |
| rooms | — | — | read | full |
| memberships | — | own rows only | own rows | full (their suite) |
| profiles | — | own row | own row | own row |
| reserved_slugs | read | read | read | read |

Writes: only owners mutate their suite's tabs/rooms/plans; suite
`INSERT` requires `owner_id = auth.uid()`; membership self-join is only
allowed into **published free** suites with role `member` (paid joins wait
for the payments milestone).

## 5. Implementation checklist (all complete)

- [x] Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui scaffold
- [x] Supabase clients (browser/server) + session middleware
- [x] Migration: schema, triggers, RPCs, storage bucket
- [x] RLS policies on all tables
- [x] Signup / login / logout / protected routes
- [x] Onboarding wizard (name → type → access/price → branding → generate)
- [x] Seeded tabs + rooms per template type
- [x] Reserved slug checking (DB trigger + live wizard check)
- [x] Routes: `/`, `/login`, `/signup`, `/new`, `/s/[slug]`, `/dashboard/[slug]`
- [x] RLS test suite proving cross-tenant leaks fail (`pnpm test:rls`)

## Acceptance criteria mapping

| Criterion | Where proven |
| --- | --- |
| Sign up as A/B, create Suite A/B | signup + wizard; `rls.test.sql` mirrors it in SQL |
| Visit `/s/suite-a`, `/s/suite-b` | public page + anon policies (tested) |
| `/dashboard/suite-a` only as owner | owner check → 404, backed by RLS |
| A cannot read B's private data (and vice versa) | `pnpm test:rls` — rooms, memberships, private tabs, profiles, and all writes are asserted to fail both directions |

## Explicitly out of scope (per the brief)

Payments/Stripe, community-room UI, post composer, analytics,
tokens/keys, custom domains, native apps.
