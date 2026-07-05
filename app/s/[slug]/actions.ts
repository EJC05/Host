"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PLATFORM_FEE_PERCENT, appUrl, getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Plan, Suite } from "@/lib/types";

export type JoinResult = { ok: true } | { ok: false; error: string };

// Free self-join. RLS enforces: published free suites only, role=member,
// tier=free. Paid membership arrives with the payments milestone.
export async function joinSuite(
  suiteId: string,
  slug: string
): Promise<JoinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to be logged in to join." };
  }

  const { error } = await supabase.from("memberships").insert({
    suite_id: suiteId,
    user_id: user.id,
    role: "member",
    tier: "free",
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true }; // already a member
    }
    return { ok: false, error: "Could not join this suite." };
  }

  revalidatePath(`/s/${slug}`, "layout");
  return { ok: true };
}

// C. Member subscribes to a paid suite: Stripe Checkout with destination
// charges to the owner's Connect account + 10% platform application fee.
// This action never touches membership state — the webhook does that.
export async function startMemberCheckout(
  slug: string
): Promise<JoinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You need to be logged in to subscribe." };
  }

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite || !suite.published) {
    return { ok: false, error: "This suite is not available." };
  }
  if (suite.owner_id === user.id) {
    return { ok: false, error: "You own this suite." };
  }
  if (suite.access !== "paid") {
    return { ok: false, error: "This suite is free — use Join instead." };
  }
  // A paid suite cannot accept member payments until payouts are ready.
  if (!suite.connect_ready || !suite.stripe_connect_id) {
    return { ok: false, error: "Memberships are not open yet." };
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("tier, status")
    .eq("suite_id", suite.id)
    .eq("user_id", user.id)
    .maybeSingle<Pick<Membership, "tier" | "status">>();
  if (membership?.tier === "paid" && membership.status !== "canceled") {
    return { ok: false, error: "You already have a paid membership." };
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("suite_id", suite.id)
    .eq("is_active", true)
    .gt("price_cents", 0)
    .limit(1)
    .returns<Plan[]>();
  const plan = plans?.[0];
  if (!plan) {
    return { ok: false, error: "This suite has no active plan." };
  }

  const stripe = getStripe();
  const admin = createAdminClient();

  // Ensure a platform Stripe price matching the plan's current amount.
  let priceId = plan.stripe_price_id;
  if (!priceId || plan.stripe_price_cents !== plan.price_cents) {
    let productId = plan.stripe_product_id;
    if (!productId) {
      const product = await stripe.products.create({
        name: `${suite.name} membership`,
        metadata: { suite_id: suite.id, plan_id: plan.id },
      });
      productId = product.id;
    }
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price_cents,
      currency: plan.currency || "usd",
      recurring: { interval: plan.billing_interval === "year" ? "year" : "month" },
    });
    priceId = price.id;
    await admin.rpc("set_plan_stripe_price", {
      p_plan_id: plan.id,
      p_product_id: productId,
      p_price_id: priceId,
      p_price_cents: plan.price_cents,
    });
  }

  // One platform customer per user, reused across suites.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.rpc("set_profile_stripe_customer", {
      p_user_id: user.id,
      p_customer_id: customerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      application_fee_percent: PLATFORM_FEE_PERCENT,
      transfer_data: { destination: suite.stripe_connect_id },
      metadata: { kind: "member", suite_id: suite.id, user_id: user.id },
    },
    client_reference_id: `${suite.id}:${user.id}`,
    metadata: { kind: "member", suite_id: suite.id, user_id: user.id },
    success_url: appUrl(`/s/${suite.slug}/join/success`),
    cancel_url: appUrl(`/s/${suite.slug}`),
  });

  if (!session.url) return { ok: false, error: "Could not start checkout." };
  redirect(session.url);
}

// Poll target for the checkout success page. Reads the caller's own
// membership row (RLS) — never writes.
export async function getMembershipState(
  slug: string
): Promise<{ tier: string; status: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: suite } = await supabase
    .from("suites")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!suite) return null;

  const { data } = await supabase
    .from("memberships")
    .select("tier, status")
    .eq("suite_id", suite.id)
    .eq("user_id", user.id)
    .maybeSingle<{ tier: string; status: string }>();
  return data;
}
