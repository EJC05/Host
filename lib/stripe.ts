import "server-only";
import Stripe from "stripe";

// 10% platform fee on member subscription revenue (PRD payment architecture).
export const PLATFORM_FEE_PERCENT = 10;

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    client = new Stripe(key);
  }
  return client;
}

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

// Maps a Stripe subscription status onto the suite billing_status enum.
export function mapSaasStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

// Maps a Stripe subscription status onto the membership status enum.
export function mapMemberStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

// current_period_end moved from the subscription to its items in newer
// Stripe API versions — read both shapes.
export function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const direct = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const fromItem = sub.items?.data?.[0]
    ? (sub.items.data[0] as unknown as { current_period_end?: number })
        .current_period_end
    : undefined;
  const epoch = direct ?? fromItem;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}

// The invoice→subscription pointer also moved across API versions.
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | { id: string } })
    .subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  const parent = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } } };
    }
  ).parent;
  const nested = parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") return nested.id;
  return null;
}
