import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLATFORM_FEE_PERCENT,
  getStripe,
  invoiceSubscriptionId,
  mapMemberStatus,
  mapSaasStatus,
  subscriptionPeriodEnd,
} from "@/lib/stripe";

// Webhooks are the ONLY writer of billing/membership state. Every mutation
// below goes through a service_role-only Postgres RPC; the same RPCs are
// exercised by supabase/tests/money-rls.test.sql.

type Admin = ReturnType<typeof createAdminClient>;

interface SubMeta {
  kind: string | null;
  suiteId: string | null;
  userId: string | null;
}

function readMeta(metadata: Stripe.Metadata | null | undefined): SubMeta {
  return {
    kind: metadata?.kind ?? null,
    suiteId: metadata?.suite_id ?? null,
    userId: metadata?.user_id ?? null,
  };
}

async function applySaasSubscription(admin: Admin, sub: Stripe.Subscription) {
  const meta = readMeta(sub.metadata);
  if (!meta.suiteId) return;
  const { error } = await admin.rpc("apply_owner_billing", {
    p_suite_id: meta.suiteId,
    p_billing_status: mapSaasStatus(sub.status),
    p_stripe_customer_id:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    p_stripe_subscription_id: sub.id,
    p_trial_ends_at: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    p_current_period_end: subscriptionPeriodEnd(sub),
  });
  if (error) throw new Error(`apply_owner_billing: ${error.message}`);
}

async function applyMemberSubscription(
  admin: Admin,
  sub: Stripe.Subscription,
  overrideStatus?: string
) {
  const meta = readMeta(sub.metadata);
  if (!meta.suiteId || !meta.userId) return;
  const status = overrideStatus ?? mapMemberStatus(sub.status);
  const { error } = await admin.rpc("apply_member_subscription", {
    p_suite_id: meta.suiteId,
    p_user_id: meta.userId,
    p_tier: status === "canceled" ? "free" : "paid",
    p_status: status,
    p_stripe_subscription_id: sub.id,
    p_stripe_customer_id:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    p_current_period_end: subscriptionPeriodEnd(sub),
    p_cancel_at_period_end: sub.cancel_at_period_end ?? false,
  });
  if (error) throw new Error(`apply_member_subscription: ${error.message}`);
}

async function recordTransaction(
  admin: Admin,
  args: {
    suiteId: string;
    userId: string | null;
    kind: "member_payment" | "saas_payment" | "payment_failed" | "refund";
    amountCents: number;
    currency: string;
    feeCents: number | null;
    stripeRef: string | null;
  }
) {
  const { error } = await admin.rpc("record_transaction", {
    p_suite_id: args.suiteId,
    p_user_id: args.userId,
    p_kind: args.kind,
    p_amount_cents: args.amountCents,
    p_currency: args.currency,
    p_application_fee_cents: args.feeCents,
    p_stripe_ref: args.stripeRef,
  });
  if (error) throw new Error(`record_transaction: ${error.message}`);
}

async function handleCheckoutCompleted(
  admin: Admin,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "subscription" || !session.subscription) return;
  const stripe = getStripe();
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId);
  const meta = readMeta(sub.metadata);

  if (meta.kind === "saas") {
    await applySaasSubscription(admin, sub);
  } else if (meta.kind === "member") {
    await applyMemberSubscription(admin, sub);
  }
}

async function handleInvoiceEvent(
  admin: Admin,
  invoice: Stripe.Invoice,
  outcome: "succeeded" | "failed"
) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  const meta = readMeta(sub.metadata);
  if (!meta.suiteId) return;

  if (outcome === "failed") {
    await recordTransaction(admin, {
      suiteId: meta.suiteId,
      userId: meta.userId,
      kind: "payment_failed",
      amountCents: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      feeCents: null,
      stripeRef: invoice.id ?? null,
    });
    return;
  }

  if (meta.kind === "member") {
    const amount = invoice.amount_paid ?? 0;
    await recordTransaction(admin, {
      suiteId: meta.suiteId,
      userId: meta.userId,
      kind: "member_payment",
      amountCents: amount,
      currency: invoice.currency ?? "usd",
      feeCents: Math.round((amount * PLATFORM_FEE_PERCENT) / 100),
      stripeRef: invoice.id ?? null,
    });
  } else if (meta.kind === "saas") {
    await recordTransaction(admin, {
      suiteId: meta.suiteId,
      userId: null,
      kind: "saas_payment",
      amountCents: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      feeCents: null,
      stripeRef: invoice.id ?? null,
    });
  }
}

async function handleChargeRefunded(admin: Admin, charge: Stripe.Charge) {
  // charge.invoice was removed from newer API type shapes — read defensively.
  const rawInvoice = (
    charge as unknown as { invoice?: string | { id: string } | null }
  ).invoice;
  const invoiceId =
    typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id;
  if (!invoiceId) return;
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  const meta = readMeta(sub.metadata);
  if (!meta.suiteId) return;

  await recordTransaction(admin, {
    suiteId: meta.suiteId,
    userId: meta.userId,
    kind: "refund",
    amountCents: charge.amount_refunded ?? 0,
    currency: charge.currency ?? "usd",
    feeCents: null,
    stripeRef: charge.id,
  });
}

// Platform endpoint: SaaS billing, member subscriptions, invoices, refunds.
export async function handlePlatformEvent(admin: Admin, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        admin,
        event.data.object as Stripe.Checkout.Session
      );
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const meta = readMeta(sub.metadata);
      if (meta.kind === "saas") await applySaasSubscription(admin, sub);
      if (meta.kind === "member") await applyMemberSubscription(admin, sub);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const meta = readMeta(sub.metadata);
      if (meta.kind === "saas" && meta.suiteId) {
        const { error } = await admin.rpc("apply_owner_billing", {
          p_suite_id: meta.suiteId,
          p_billing_status: "canceled",
        });
        if (error) throw new Error(`apply_owner_billing: ${error.message}`);
      }
      if (meta.kind === "member") {
        await applyMemberSubscription(admin, sub, "canceled");
      }
      break;
    }

    case "invoice.payment_succeeded":
      await handleInvoiceEvent(
        admin,
        event.data.object as Stripe.Invoice,
        "succeeded"
      );
      break;

    case "invoice.payment_failed":
      await handleInvoiceEvent(
        admin,
        event.data.object as Stripe.Invoice,
        "failed"
      );
      break;

    case "charge.refunded":
      await handleChargeRefunded(admin, event.data.object as Stripe.Charge);
      break;

    default:
      break; // unhandled event types are acknowledged and ignored
  }
}

// Connect endpoint: Express account readiness.
export async function handleConnectEvent(admin: Admin, event: Stripe.Event) {
  if (event.type !== "account.updated") return;
  const account = event.data.object as Stripe.Account;

  let suiteId = account.metadata?.suite_id ?? null;
  if (!suiteId && account.id) {
    const { data } = await admin
      .from("suites")
      .select("id")
      .eq("stripe_connect_id", account.id)
      .maybeSingle<{ id: string }>();
    suiteId = data?.id ?? null;
  }
  if (!suiteId) return;

  const ready = Boolean(account.charges_enabled && account.details_submitted);
  const { error } = await admin.rpc("apply_connect_status", {
    p_suite_id: suiteId,
    p_stripe_connect_id: account.id,
    p_connect_ready: ready,
  });
  if (error) throw new Error(`apply_connect_status: ${error.message}`);
}
