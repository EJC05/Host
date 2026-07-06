# HouseKey — Functional Inspection Checklist

Manual QA pass for the core journey (Milestones 1–3). Run against a
deployed Vercel URL or `pnpm dev` with a hosted Supabase project — see
[`deploy.md`](deploy.md). Use two browsers (normal + private window) so
you can act as Owner and Visitor at the same time.

Status legend: ☐ untested · ✅ pass · ❌ fail (note what happened)

## Account

- ☐ Landing page loads at `/`
- ☐ Signup works (`/signup`) — with email confirmations ON you receive a
  link; it must land on `/auth/callback` and continue into the app
- ☐ Login works (`/login`)
- ☐ Logout works (button in the dashboard header)
- ☐ Logged-out visits to `/new`, `/dashboard`, `/account/billing`
  redirect to `/login` and return you there after logging in

## Suite creation (`/new`)

- ☐ Wizard opens for a logged-in user
- ☐ Suite name saves; slug auto-generates from the name and is editable
- ☐ Slug availability check runs (green "Available" appears)
- ☐ Reserved slug (try `admin`) is rejected
- ☐ Taken slug is rejected
- ☐ Suite type selection saves (pick e.g. Real Estate Agent)
- ☐ Free/paid selection saves; paid requires a price ≥ $1
- ☐ Branding upload works — logo appears later on the public page
- ☐ Branding skip works
- ☐ Generate lands on `/dashboard/<slug>`
- ☐ Records created (visible in the dashboard): suite header, **owner
  membership** (Members = 1), **default tabs** (5 for Real Estate Agent,
  Rooms marked "members"), **default rooms** (General, Market Updates,
  Buyer Q&A)

## Public suite

- ☐ `/s/<slug>` loads (also in a logged-out private window)
- ☐ Header shows cover (or brand-color gradient), logo/avatar initial,
  suite name, tagline (if set)
- ☐ Tab navigation shows Home / Feed / About with active state
- ☐ About page loads at `/s/<slug>/about`
- ☐ Feed page loads at `/s/<slug>/feed`
- ☐ Unknown suite (`/s/does-not-exist`) returns 404
- ☐ Join button: "Join free" (free suite, logged in) / "Join" → signup
  (logged out) / "Membership coming soon" (paid suite without Stripe
  Connect) / "Manage suite" (owner)

## Dashboard

- ☐ `/dashboard/<slug>` loads for the owner (Overview: access, members,
  posts, status cards; tabs & rooms lists)
- ☐ A second user visiting your `/dashboard/<slug>` gets a 404
- ☐ Content page loads at `/dashboard/<slug>/content`
- ☐ New-post page loads at `/dashboard/<slug>/content/new`
- ☐ Existing post opens for editing; changes save; delete works
- ☐ "View public page" button opens `/s/<slug>` (this is the public URL
  to share)
- ☐ Billing tab loads (plan/payouts cards; Stripe buttons will error
  until Stripe env vars are configured — that's expected pre-Stripe)

## Posts / content

- ☐ Owner creates a **public** post (published) → appears on `/s/<slug>`
  home and `/s/<slug>/feed`, fully readable logged out
- ☐ Owner creates a **free members** post → logged out it shows a 🔒
  teaser card; opening it shows the locked card, not the body
- ☐ Owner creates a **paid members** post → same locked behavior for
  everyone who hasn't paid
- ☐ **Body-leak check**: logged out, open a locked post and use
  View Source / DevTools → the body text must appear nowhere in the
  HTML or network responses (only title/excerpt)
- ☐ Second user joins free → free-members post unlocks; paid-members
  post stays locked
- ☐ Draft post is visible only in the owner's dashboard, not on the
  public feed (even for members)
- ☐ Pinned post sorts to the top of the feed with a 📌 badge

## Mobile (≈375 px wide — use DevTools device toolbar or a phone)

- ☐ Landing page: readable, buttons tappable, no horizontal scroll
- ☐ Public suite page: header wraps cleanly, tabs usable, cards stack
- ☐ Post detail: readable
- ☐ Dashboard: usable enough for inspection (desktop-first is fine)

## Payments (only after Stripe env vars are set — see deploy.md §8)

- ☐ Owner: Billing → Start 14-day trial → Stripe test checkout
  (4242 4242 4242 4242) → returns; status shows "Trial" after webhook
- ☐ Owner: Connect payouts → Express onboarding → "Payouts ready" after
  webhook
- ☐ Member: Subscribe on paid suite → checkout → success page confirms
  within seconds → paid post unlocks
- ☐ Member: `/account/billing` → cancel in portal → access persists to
  period end, then downgrades
