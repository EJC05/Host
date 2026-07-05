# Milestone 1 — PRD Reconciliation Report

Compares the Milestone 1 implementation (branch
`claude/housekey-m1-skeleton-by32vp`) against
[`docs/housekey-prd.md`](housekey-prd.md).

**Context:** the PRD was not in the repository when Milestone 1 was
built. It has now been reconstructed from the founder's briefs and
committed; the one material mismatch found (launch templates) was
corrected in the same change set as this report.

## 1. What matches the PRD

- **Stack** — Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui,
  Supabase (Auth, Postgres, RLS, Storage), pnpm.
- **Tenancy model** — suites as tenants with unique slugs; profiles,
  suite tabs, memberships, plans, rooms, reserved slugs.
- **Auth** — signup / login / logout, session middleware, protected
  routes (`/dashboard*`, `/new`).
- **Onboarding wizard** — name → template → free/paid + price →
  upload/skip branding → review → generate, exactly the PRD §5 flow,
  including live + DB-enforced slug checking and atomic seeded creation.
- **Routing** — `/`, `/login`, `/signup`, `/new`, `/s/[slug]`,
  `/dashboard/[slug]` all present; non-owners get a 404 on foreign
  dashboards (no existence hints).
- **Scope discipline** — no payments/Stripe, no rooms UI, no composer,
  no analytics, no tokens, no custom domains (PRD §8).

## 2. What differed from the PRD

| # | Difference | Severity | Status |
| --- | --- | --- | --- |
| 1 | **Launch templates.** Implementation shipped 3 invented types (`creator`, `community`, `business`); PRD §4 specifies 5: Real Estate Agent, Creator/Influencer, Coach/Consultant, Business/Brand, Custom. | High (wrong enum values would persist in production data) | **Fixed** — enum, seeds, TypeScript catalog, wizard, page labels, and tests all updated. |
| 2 | Suite pages showed the raw enum value (e.g. `creator`) instead of a display label. | Cosmetic | **Fixed** — `suiteTypeLabel()` used on public page and dashboard. |
| 3 | `suites.suite_type` default was `creator`; with the new catalog the neutral default is `custom`. | Low | **Fixed.** |

No other divergences were found: routes, wizard steps, access modes,
price floor ($1.00), and slug rules all match.

## 3. What should be fixed before Milestone 2

Applied in this change set (nothing else blocking):

- Template enum + seeds corrected (difference #1 above). Because the
  branch has never been deployed or merged, `0001_init.sql` was amended
  in place rather than adding a corrective migration — **if you have
  already applied the old migration to a Supabase project, reset that
  database (`supabase db reset`) before pulling.**

Non-blocking notes for Milestone 2 planning:

- `plans` will need Stripe columns (product/price IDs) and the
  paid-join flow; the schema deliberately leaves these out now.
- The public page's "Joining opens soon" button is the intended
  attachment point for M2 checkout / free self-join UI (the DB policy
  for free self-join already exists and is tested).

## 4. Does the database schema match the PRD?

**Yes** (PRD §6), after the template fix. Verified table-by-table:
profiles (trigger-created), suites (slug rules 3–48 `[a-z0-9-]`,
access, branding, published), suite_tabs (kind/position/is_public),
memberships (unique suite+user, owner|member), plans (price_cents,
currency, month|year, no Stripe fields), rooms, reserved_slugs
(trigger-enforced). Suite creation is the single SECURITY DEFINER RPC
the PRD requires.

## 5. Do the template seeds match the PRD?

**Yes, now.** Seeds implement PRD §4 exactly:

| Template | Tabs | Rooms |
| --- | --- | --- |
| Real Estate Agent | Home, Listings, Rooms\*, About, Contact | General, Market Updates, Buyer Q&A |
| Creator / Influencer | Home, Rooms\*, About, Links | General, Announcements |
| Coach / Consultant | Home, Rooms\*, About, Contact | General, Q&A, Wins |
| Business / Brand | Home, Rooms\*, About, Contact | General, Support |
| Custom | Home, Rooms\*, About | General |

\* Rooms tab is member-only in every template, per the PRD rule.
The RLS test suite asserts seed counts for two templates
(creator_influencer: 4 tabs/2 rooms; real_estate_agent: 5 tabs/3 rooms).

## 6. Do the RLS policies match the PRD?

**Yes** (PRD §7, requirements 1–7):

1. RLS enabled on all 7 public tables. ✓
2. Anon reads limited to published suites, public tabs, active pricing,
   reserved slugs. ✓ (tested)
3. Rooms, rosters, profiles hidden from anon and non-members. ✓ (tested)
4. All writes owner-only. ✓ (tested, including self-granted-ownership
   attempts)
5. Self-join only into published **free** suites as `member`; paid join
   blocked pending M2. ✓ (tested both directions)
6. Reserved/duplicate slugs rejected in the DB (trigger + RPC). ✓ (tested)
7. Automated cross-tenant tests: `pnpm test:rls`. ✓

## 7. Assumptions made because the PRD was missing

- **Launch templates** — invented as creator/community/business; wrong,
  now corrected to the PRD's five (the only assumption that produced a
  real mismatch).
- **Reconstructed PRD itself** — `docs/housekey-prd.md` was authored
  from the briefs, so its finer details (room names per template,
  roadmap grouping of M3–M5, persona wording) are proposals codified as
  canon rather than transcription of an original document. Review §4
  seed lists and §8 roadmap in particular.
- **Held assumptions that turned out consistent with the briefs:**
  price floor $1.00/month USD; monthly billing only; suites published by
  default; one active plan per suite; slug rules (3–48 chars,
  lowercase/digits/hyphens); logo storage keyed by user id; member role
  set limited to owner|member; free self-join allowed at the DB layer.
