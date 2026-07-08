# Code Review Findings — pre-inspection pass

Automated multi-angle review of the whole branch (correctness, cross-file
contracts, SQL/RLS, cleanup). Fixed items were blocking or cheap
non-payment security; deferred items are real but touch payment logic
that is intentionally not enabled yet.

## Fixed in this pass

1. **Server-action redirect flashed a false error (blocked inspection).**
   In Next 15.5 a server action that `redirect()`s resolves the client
   promise with `undefined` (not a thrown control-flow error, as the code
   assumed). `savePost`/`deletePost` therefore hit `setError(result.error)`
   on a *successful* save, showing "Something went wrong" and re-enabling
   the button — inviting duplicate posts. Fixed the post composer and the
   Stripe-button callers to treat a returned object as the failure signal
   and `undefined` as success-in-progress.
   Files: `components/content/post-composer.tsx`,
   `components/dashboard/billing-buttons.tsx`,
   `components/suite/join-button.tsx`,
   `components/account/manage-subscription-button.tsx`.

2. **Open redirect via `next` param.** `next.startsWith("/")` admitted
   protocol-relative URLs (`//evil.com`), so a crafted
   `/login?next=//evil.com` sent a freshly-authenticated user off-site.
   Added `safeNextPath()` (rejects `//` and `/\`) and used it in login and
   signup. Files: `lib/validation.ts`, `app/(auth)/login/page.tsx`,
   `app/(auth)/signup/page.tsx`.

## Deferred to the payments-hardening pass (do before enabling Stripe)

These do not affect the current inspection (no Stripe data exists until
payments are enabled) and are fenced off by the "don't modify payment
logic" constraint.

3. **Billing/Stripe columns are world-readable.** 0001's table-level
   SELECT grant + `suites_select_visible (to anon)` expose the columns
   0005 later added (`stripe_customer_id`, `stripe_subscription_id`,
   `stripe_connect_id`, `billing_status`, `trial_ends_at`,
   `current_period_end`) to anyone with the anon key, and the public
   layout does `select('*')`. Fix needs a column split or a public
   view/explicit-column select — `connect_ready` must stay public (the
   JoinButton needs it) but the Stripe identifiers must not.

4. **`plans` INSERT/DELETE not hardened.** 0005 revokes UPDATE on the
   Stripe pointer columns but not INSERT/DELETE, so an owner can
   insert/recreate a plan row with a forged `stripe_price_id` /
   `stripe_price_cents`; `startMemberCheckout` would then reuse that
   price. Add column-scoped INSERT grants (mirroring the UPDATE grant) and
   a test on the INSERT path.

5. **Webhook events applied without ordering guard.**
   `apply_member_subscription` / `apply_owner_billing` last-write-wins;
   an out-of-order retried `subscription.updated (active)` after
   `subscription.deleted` can resurrect canceled paid access. Guard on
   the Stripe event/period timestamps.

6. **Duplicate member checkout & racy customer creation.** Two concurrent
   `startMemberCheckout` calls can create two subscriptions / two Stripe
   customers before the first webhook lands. Add an idempotency key or a
   pre-checkout lock.

7. **Stripe SDK calls not wrapped in try/catch.** The billing actions
   return `{ok:false}` by contract but let SDK throws propagate (no
   `error.tsx` boundary exists), replacing the dashboard with an unstyled
   error page — notably when the test-mode Customer Portal isn't
   configured. Wrap and return the `{ok:false,error}` shape.

8. **Paywall copy is stale once payments are live.**
   `locked-post-card.tsx` always says "Paid memberships open soon";
   should point at the working Subscribe flow when `connect_ready`.

## Noted, not acted on (quality, not correctness)

- Suite-fetch-by-slug is hand-copied across ~12 files; a
  `getSuiteBySlug(supabase, slug)` helper in `lib/suite-access.ts` would
  consolidate it. The two Stripe webhook routes are near-verbatim twins.
  Visibility labels/options are defined in four places. Non-blocking;
  worth a cleanup pass later.
