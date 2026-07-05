# HouseKey — Product Requirements Document

> **Provenance:** the original PRD document was never checked into this
> repository. This document was reconstructed from the founder's written
> briefs (the Milestone 1 specification, its exclusion list, and the
> launch-template list) and is the canonical PRD as of its first commit.
> Any future edits to product scope should be made here first.

## 1. Overview

HouseKey is a multi-tenant SaaS platform that lets an individual or small
business launch their own branded **member suite** — a private,
white-labeled home for their audience — in minutes, without code.

A suite lives at `housekey.app/s/<slug>` (custom domains later), carries
the owner's branding, and contains public pages plus member-only
community rooms. Owners choose whether membership is free or paid.

## 2. Personas

**Owners** (the paying customers of HouseKey):

- Real estate agents — client hub: listings, neighborhood updates, buyer Q&A.
- Creators / influencers — audience home: links, announcements, fan rooms.
- Coaches / consultants — client space: programs, Q&A, wins.
- Businesses / brands — customer hub: support, updates, community.
- Anyone else — a custom, minimally-seeded suite.

**Members** — people who join a suite (free or paid) to access its
member-only rooms and content.

**Visitors** — anonymous users browsing a suite's public pages.

## 3. Core concepts & vocabulary

| Concept | Definition |
| --- | --- |
| **Suite** | A tenant. Owned by one user; has a unique slug, name, template type, access mode, branding, and published state. |
| **Suite tab** | A navigation tab of a suite. Tabs are public or member-only. |
| **Room** | A member-only community space inside a suite (chat/posts arrive in a later milestone). |
| **Membership** | A user's relationship to a suite (`owner` or `member`). |
| **Plan** | The pricing of a suite's membership (free, or a monthly/yearly price). Stripe integration arrives in Milestone 2. |
| **Reserved slug** | Slugs the platform keeps for itself (`admin`, `api`, `login`, …); can never be claimed. |

## 4. Launch templates

When an owner creates a suite they pick one of five launch templates.
The template seeds the suite's tabs and rooms; everything is editable
later (editing UI in a later milestone).

| Template | Enum value | Seeded tabs (public?) | Seeded rooms |
| --- | --- | --- | --- |
| Real Estate Agent | `real_estate_agent` | Home ✓, Listings ✓, Rooms ✗, About ✓, Contact ✓ | General, Market Updates, Buyer Q&A |
| Creator / Influencer | `creator_influencer` | Home ✓, Rooms ✗, About ✓, Links ✓ | General, Announcements |
| Coach / Consultant | `coach_consultant` | Home ✓, Rooms ✗, About ✓, Contact ✓ | General, Q&A, Wins |
| Business / Brand | `business_brand` | Home ✓, Rooms ✗, About ✓, Contact ✓ | General, Support |
| Custom | `custom` | Home ✓, Rooms ✗, About ✓ | General |

Rules:

- The **Rooms** tab is always member-only (rooms are private content).
- Seeding is atomic with suite creation — a suite never exists half-seeded.
- Rooms have no UI in Milestone 1 beyond seeded records.

## 5. Owner onboarding wizard

Flow (after account creation): **name suite → choose template → choose
free or paid (set price if paid) → upload/skip branding (logo, brand
color) → review → generate suite**, landing on the owner dashboard.

- Slug is auto-suggested from the name, editable, checked live for
  availability (format + reserved + taken), and enforced again in the
  database.
- Paid price: USD, min $1.00, monthly (yearly later). No payment is
  collected in Milestone 1 — the price is stored on the plan.
- Branding is optional and skippable; logo uploads go to Supabase
  Storage under the uploader's own folder.

## 6. Data model

Postgres (Supabase), schema `public`:

- `profiles` — 1:1 with `auth.users`; auto-created on signup via trigger.
  `display_name`, `avatar_url`.
- `suites` — `owner_id`, unique `slug` (lowercase, 3–48 chars,
  `[a-z0-9-]`, no leading/trailing hyphen), `name`, `suite_type`
  (template enum above), `access` (`free | paid`), `logo_url`,
  `brand_color` (hex), `published`.
- `suite_tabs` — `suite_id`, `title`, `kind`
  (`home | rooms | about | links | members | contact | custom`),
  `position`, `is_public`.
- `memberships` — `suite_id` + `user_id` unique, `role`
  (`owner | member`).
- `plans` — `suite_id`, `name`, `price_cents`, `currency`,
  `billing_interval` (`month | year`), `is_active`. Stripe columns are
  added in Milestone 2, not before.
- `rooms` — `suite_id`, `name`, `description`, `position`.
- `reserved_slugs` — platform-reserved slugs; enforced by DB trigger.

Suite creation is a single SECURITY DEFINER function
(`create_suite_with_defaults`) that validates, creates the suite, the
owner membership, the plan, and the template seeds in one transaction.

## 7. Security & tenancy requirements

Row-Level Security is the enforcement boundary; application-level checks
are UX only. Requirements:

1. Every table in `public` has RLS enabled.
2. Anonymous visitors can read only: published suites' metadata, their
   public tabs, their active pricing, and the reserved-slug list.
3. Rooms, member rosters, and profiles are never visible to anonymous
   users or to authenticated non-members.
4. Only a suite's owner can write to that suite and its tabs, rooms,
   plans, and roster.
5. A user may self-join only a **published free** suite, only as
   `member`. Joining paid suites is gated on payments (Milestone 2).
6. Reserved and duplicate slugs are rejected in the database, not just
   in the UI.
7. Cross-tenant isolation must be covered by automated tests that fail
   the build if a leak appears.

## 8. Roadmap (milestones)

| Milestone | Scope |
| --- | --- |
| **M1 — Skeleton & tenancy** (this repo's current state) | Project setup, schema, RLS, auth, onboarding wizard, template seeding, reserved slugs, public suite page, owner dashboard, RLS tests. |
| **M2 — Payments** | Stripe Connect, paid membership checkout, plan management, member self-join for paid suites. |
| **M3 — Community** | Rooms UI, post composer, member experience inside the suite. |
| **M4 — Growth** | Analytics for owners, invites. |
| **M5 — Platform** | API tokens/keys, custom domains. |
| Later | Native apps, yearly billing, multiple plans per suite, additional roles (admin/moderator). |

Out of scope until their milestone: payments/Stripe, community-room UI,
post composer, analytics, tokens/keys, custom domains, native apps.

## 9. Milestone 1 acceptance criteria

1. Sign up as User A; create Suite A. Sign up as User B; create Suite B.
2. `/s/suite-a` and `/s/suite-b` render publicly (logged out).
3. `/dashboard/suite-a` is reachable only by Suite A's owner; other
   users get a 404 (no existence hints).
4. User A cannot read or write Suite B's private data, and vice versa —
   proven by automated RLS tests, not just UI behavior.
