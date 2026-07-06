# HouseKey — Functional Inspection Checklist

Manual QA pass for the core journey (Milestones 1–3). Run against a
deployed Vercel URL or `pnpm dev` with a hosted Supabase project — see
[`deploy.md`](deploy.md). Use two browsers (normal + private window) so
you can act as Owner and Visitor at the same time.

Status legend: ☐ untested · ✅ pass · ❌ fail (note what happened)

## Scripted first inspection (do this exact flow first)

**Account & suite**

1. ☐ Open the landing page — loads, header shows Log in / Sign up.
2. ☐ **Sign up** (User A). If asked, confirm via the email link — it
   must return you to the app logged in.
3. ☐ You land on `/new`. Create the test suite:
   - Name: `Smith Realty Insider` (slug auto-fills
     `smith-realty-insider`; wait for the green "Available")
   - Type: **Real Estate Agent**
   - Access: **Free**
   - Branding: **skip** (or upload a simple image)
   - Review → **Generate suite**
4. ☐ You land on `/dashboard/smith-realty-insider`. Confirm on the
   Overview: **Members = 1** (owner membership), **Tabs list** shows
   Home, Listings, Rooms (members), About, Contact, and **Rooms list**
   shows General, Market Updates, Buyer Q&A.

**Public suite**

5. ☐ Open `/s/smith-realty-insider` — header, suite name, cover/logo
   area, and Home/Feed/About tabs display.
6. ☐ Open `/s/smith-realty-insider/feed` — loads ("Nothing posted yet").
7. ☐ Open `/s/smith-realty-insider/about` — loads.

**Posts**

8. ☐ Go to `/dashboard/smith-realty-insider/content` → **New post**:
   - Title: `July LA Market Update` — Visibility: **Public** —
     Body: `Quick update on buyer demand, interest rates, and what
     sellers should know this month.` — check **Published** → save.
9. ☐ It appears on `/s/smith-realty-insider/feed` and is fully
   readable.
10. ☐ Create a second post:
    - Title: `Members-Only Seller Strategy` — Visibility:
      **Paid members** — Excerpt: `A private breakdown for sellers
      preparing to list this summer.` — any body text — **Published**.
11. ☐ **Log out** (or use a private window). On the feed, the locked
    post shows a 🔒 teaser card only; opening it shows the locked
    card, not the body.
12. ☐ View Source on that page — the locked post's body text appears
    nowhere in the HTML.

**Security**

13. ☐ In the private window, sign up as **User B**.
14. ☐ As B, open `/dashboard/smith-realty-insider` → must be a 404.
15. ☐ Open `/s/this-suite-does-not-exist` → 404.

**Mobile** (DevTools device toolbar or a phone)

16. ☐ Landing page, `/s/smith-realty-insider`, and the dashboard are
    readable at ~375px with no horizontal scrolling.

If all 16 pass, the creation flow is functional. The full granular
checklist follows for deeper passes.

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
