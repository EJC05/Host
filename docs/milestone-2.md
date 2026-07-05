# HouseKey — Milestone 2: Public Suite & Content

## 1. Implementation plan

1. **Schema** (`supabase/migrations/0003_public_content.sql`):
   posts + post_bodies tables, suite theming columns, membership tiers.
2. **Storage** (`0004_storage_media.sql`): public `media` bucket for post
   images and suite cover images (Supabase-only, skipped by test harness).
3. **Themed public suite layout**: shared layout for all `/s/[slug]/*`
   pages — cover, logo, name, tagline, join button, tab nav, per-suite
   light/dark theme, primary/accent colors.
4. **Public pages**: home (pinned + recent posts), feed, post detail
   (full render or locked teaser), about.
5. **Dashboard shell**: layout with Overview/Content nav; content list,
   composer (new/edit) with image upload, video embed, visibility,
   draft/publish, pin, delete.
6. **Join button**: free self-join for logged-in users (the RLS policy
   already existed in M1); paid suites show "membership coming soon" —
   no checkout, no Stripe.
7. **RLS tests**: new `supabase/tests/posts-rls.test.sql` covering the
   eight required scenarios; harness updated to run both test files.

**The locked-body guarantee.** RLS is row-granular, so the post body
lives in its own table (`post_bodies`, PK = post_id) with a SELECT
policy driven by `can_read_post_body()`. Teaser fields (title, excerpt,
media, visibility) live on `posts` and are readable wherever a teaser
card may render. A locked body is therefore never in any result set —
not merely hidden by the UI.

## 2. Database / RLS changes

New enums: `post_visibility` (`public | free_members | paid_members`),
`post_status` (`draft | published`), `membership_tier` (`free | paid`).

| Change | Detail |
| --- | --- |
| `suites` + columns | `tagline` (≤160), `about`, `cover_image_url`, `accent_color` (hex), `theme` (`light|dark`, default light) |
| `memberships` + column | `tier membership_tier not null default 'free'`; self-join policy re-created to force `tier = 'free'` (no self-granted paid access) |
| `posts` (new) | suite_id, author_id, title, excerpt, `media jsonb` (`{image_url, video_url}`), visibility, status, pinned, published_at (set by trigger on first publish), timestamps |
| `post_bodies` (new) | post_id PK → posts, body text |

Policies:

- `posts` SELECT (anon + authenticated): owner sees all (incl. drafts);
  everyone else sees only `status = 'published'` posts of published
  suites (teaser data). INSERT/UPDATE/DELETE: suite owner only; insert
  additionally requires `author_id = auth.uid()`.
- `post_bodies` SELECT: `can_read_post_body(post_id)` — owner always;
  otherwise the post must be published in a published suite AND
  (visibility public) OR (free_members ∧ viewer has any membership) OR
  (paid_members ∧ viewer's membership tier = paid). Writes: owner only.

## 3. Page / component map

```
app/s/[slug]/
  layout.tsx              # themed shell: cover, logo, name, tagline,
                          # JoinButton, SuiteNav, light/dark + brand colors
  actions.ts              # joinSuite server action (free suites only)
  page.tsx                # Home: pinned + latest posts, pricing/join card
  about/page.tsx          # About: suite.about + details
  feed/page.tsx           # Feed: all published posts as cards
  feed/[postId]/page.tsx  # Detail: full post or LockedPostCard;
                          # comments placeholder when unlocked
app/dashboard/[slug]/
  layout.tsx              # owner check + header + Overview/Content nav
  page.tsx                # Overview (from M1, header moved to layout)
  content/page.tsx        # post list: status/visibility/pinned, edit links
  content/new/page.tsx    # composer (create)
  content/[id]/page.tsx   # composer (edit) + delete
app/dashboard/content-actions.ts  # savePost / deletePost server actions
components/suite/
  join-button.tsx         # join / member / owner / coming-soon states
  nav.tsx                 # tab navigation with active state (client)
  post-card.tsx           # teaser card with lock badge
  locked-post-card.tsx    # teaser/paywall card on detail page
  video-embed.tsx         # YouTube/Vimeo iframe from stored URL
components/content/
  post-composer.tsx       # title/body/excerpt/image/video/visibility/
                          # status/pin, image upload to media bucket
lib/
  suite-access.ts         # getViewerContext + canReadPostBody (UI mirror
                          # of the DB rule — RLS remains the enforcement)
  embed.ts                # video URL → embed URL parsing
```

## 4. Acceptance tests (`pnpm test:rls`)

SQL tests run against a real Postgres with the production migrations:

1. Visitor (anon) sees published post teasers and reads **public** post
   bodies.
2. Visitor gets **zero rows** from `post_bodies` for free-member and
   paid-member posts (locked bodies never leave the DB).
3. Free member reads free-member post bodies.
4. Free member cannot read paid-member post bodies.
5. Paid member (tier upgraded by the owner) reads paid-member bodies.
6. User A (owner of Suite A) cannot read Suite B's members-only post
   bodies; writes into Suite B's posts fail.
7. Drafts: teaser and body visible to the owner only — invisible to
   anon, members, and other owners.
8. Tier hardening: self-join with `tier='paid'` is rejected; a member
   cannot update their own membership tier.

Manual acceptance: create posts of each visibility as owner → logged-out
browser shows locked teasers with no body in the HTML; join free suite
as another user → free-member posts unlock, paid-member posts stay
locked; drafts appear only in the owner dashboard.

## Out of scope (unchanged)

Stripe/payments/checkout, tokens/keys, full community rooms UI,
analytics, events, custom domains. Comments are a **placeholder card
only** — no comments table yet; it arrives with the community milestone.
