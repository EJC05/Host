"use server";

import { redirect } from "next/navigation";
import { appUrl, getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type PortalResult = { ok: false; error: string };

// Stripe Customer Portal for the member's own subscriptions (platform
// customer). Cancellation happens in the portal; the resulting
// subscription.updated / .deleted webhooks change membership state.
export async function openMemberBillingPortal(): Promise<PortalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not logged in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (!profile?.stripe_customer_id) {
    return { ok: false, error: "No billing account yet." };
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: appUrl("/account/billing"),
  });
  redirect(session.url);
}
