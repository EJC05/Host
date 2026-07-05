# Deploying HouseKey to Vercel

Environment variables: see [`.env.example`](../.env.example). The three
in the first block make the app viewable; the Stripe/service-role block
is only needed for the Milestone 3 money features and can be added later.

## 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick an org, name it (e.g. `housekey`), set a strong database
   password, choose a region near your users → **Create**.
3. Wait ~2 minutes for provisioning.

## 2. Apply the migrations

**Option A — Supabase CLI (recommended):**

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>   # ref is in the dashboard URL
npx supabase db push                            # applies supabase/migrations/ in order
```

**Option B — SQL editor:** paste and run each file in the dashboard's
SQL editor **in order**: `0001_init.sql`, `0002_storage_branding.sql`,
`0003_public_content.sql`, `0004_storage_media.sql`,
`0005_membership_money.sql`.

Verify: Table Editor shows `suites`, `posts`, `memberships`, …; Storage
shows the `branding` and `media` buckets.

## 3. Get the Supabase URL and keys

Dashboard → **Project Settings → API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never
  expose in the browser — only needed once you enable Stripe)

Also configure auth redirects (dashboard → **Authentication → URL
Configuration**):

- **Site URL**: `https://<project>.vercel.app`
- **Redirect URLs**: add `https://<project>.vercel.app/auth/callback`
  (and `http://localhost:3000/auth/callback` for local dev)

Without this, email-confirmation links will point to the wrong host.

## 4. Add environment variables to Vercel

Vercel project → **Settings → Environment Variables** (or during import):

| Name | Value | Needed for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from step 3 | everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 3 | everything |
| `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` | Stripe redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 3 | payments only |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys | payments only |
| `STRIPE_WEBHOOK_SECRET` | created in step 8 | payments only |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | created in step 8 | payments only |
| `STRIPE_SUITE_PLAN_PRICE_ID` | $99/mo price you create in Stripe | payments only |

Apply to **Production** (and Preview if you want preview deploys to work
against the same Supabase project).

## 5. Import the GitHub repo into Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   select `EJC05/Host` (install the Vercel GitHub app if prompted).
2. Framework preset: **Next.js** (auto-detected). Build command
   `pnpm build`, install `pnpm install`, output — leave defaults.
3. Note: this repo's default branch is
   `claude/housekey-m1-skeleton-by32vp` — Vercel deploys the default
   branch as Production. That's fine; if you'd rather have `main`,
   rename the branch on GitHub (Settings → Branches) before importing.

## 6. Deploy

Click **Deploy**. First build takes ~2 minutes. Every push to the
default branch now auto-deploys to production; other branches get
preview URLs. After the first deploy, if you didn't know the final URL
earlier, update `NEXT_PUBLIC_APP_URL` and the Supabase Site URL to match
and redeploy.

## 7. Test the live URL

1. `https://<project>.vercel.app/` → marketing page renders.
2. **Sign up** as User A (confirm the email if confirmations are on —
   the link must land on `/auth/callback`).
3. Complete the onboarding wizard → lands on `/dashboard/<slug>`.
4. Visit `/s/<slug>` logged out (private window) → public page renders.
5. Write a post for each visibility in **Content**; logged out, the
   members-only ones show locked teasers and view-source contains no
   body text.
6. Sign up as User B in the private window, join Suite A free → the
   free-members post unlocks; `/dashboard/<suite-a-slug>` as B → 404.

## 8. (Later) Enable payments

1. Stripe dashboard (test mode) → create a $99/month recurring price →
   set `STRIPE_SUITE_PLAN_PRICE_ID`.
2. Developers → Webhooks → add endpoint
   `https://<project>.vercel.app/api/webhooks/stripe` listening to
   `checkout.session.completed`, `customer.subscription.*`,
   `invoice.payment_succeeded`, `invoice.payment_failed`,
   `charge.refunded` → copy signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Add a second endpoint
   `https://<project>.vercel.app/api/webhooks/stripe-connect` with
   **"Listen to events on Connected accounts"** checked, event
   `account.updated` → `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Set `STRIPE_SECRET_KEY` + `SUPABASE_SERVICE_ROLE_KEY`, redeploy, then
   run the test-mode flows (card `4242 4242 4242 4242`).
