"use server";

import { redirect } from "next/navigation";
import { appUrl, getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Suite } from "@/lib/types";

export type BillingActionResult = { ok: false; error: string };

// Loads the suite and proves the caller owns it. All actions below redirect
// to Stripe on success and only return on failure.
async function requireOwnedSuite(
  slug: string
): Promise<{ suite: Suite; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite || suite.owner_id !== user.id) return null;

  return { suite, userId: user.id };
}

// A. Owner subscribes to the HouseKey Suite plan ($99/mo, 14-day trial,
// card collected up front).
export async function startOwnerCheckout(
  slug: string
): Promise<BillingActionResult> {
  const ctx = await requireOwnedSuite(slug);
  if (!ctx) return { ok: false, error: "Not authorized." };
  const { suite } = ctx;

  const priceId = process.env.STRIPE_SUITE_PLAN_PRICE_ID;
  if (!priceId) {
    return { ok: false, error: "Billing is not configured yet." };
  }

  const stripe = getStripe();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let customerId = suite.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { suite_id: suite.id, kind: "saas_owner" },
    });
    customerId = customer.id;
    // Pointer only — billing_status remains webhook-controlled.
    const admin = createAdminClient();
    await admin.rpc("set_suite_stripe_customer", {
      p_suite_id: suite.id,
      p_customer_id: customerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { kind: "saas", suite_id: suite.id },
    },
    client_reference_id: suite.id,
    metadata: { kind: "saas", suite_id: suite.id },
    success_url: appUrl(`/dashboard/${suite.slug}/billing?checkout=success`),
    cancel_url: appUrl(`/dashboard/${suite.slug}/billing?checkout=canceled`),
  });

  if (!session.url) return { ok: false, error: "Could not start checkout." };
  redirect(session.url);
}

// A. Stripe Customer Portal for the owner's SaaS subscription.
export async function openOwnerBillingPortal(
  slug: string
): Promise<BillingActionResult> {
  const ctx = await requireOwnedSuite(slug);
  if (!ctx) return { ok: false, error: "Not authorized." };
  const { suite } = ctx;

  if (!suite.stripe_customer_id) {
    return { ok: false, error: "No billing account yet — subscribe first." };
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: suite.stripe_customer_id,
    return_url: appUrl(`/dashboard/${suite.slug}/billing`),
  });
  redirect(session.url);
}

// B. Stripe Connect Express onboarding (create or resume).
export async function connectPayouts(
  slug: string
): Promise<BillingActionResult> {
  const ctx = await requireOwnedSuite(slug);
  if (!ctx) return { ok: false, error: "Not authorized." };
  const { suite } = ctx;

  const stripe = getStripe();
  let accountId = suite.stripe_connect_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { suite_id: suite.id },
    });
    accountId = account.id;
    // Pointer only — connect_ready is set solely by account.updated webhooks.
    const admin = createAdminClient();
    await admin.rpc("set_suite_connect_account", {
      p_suite_id: suite.id,
      p_connect_id: accountId,
    });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: appUrl(`/dashboard/${suite.slug}/billing?connect=refresh`),
    return_url: appUrl(`/dashboard/${suite.slug}/billing?connect=return`),
    type: "account_onboarding",
  });
  redirect(link.url);
}
