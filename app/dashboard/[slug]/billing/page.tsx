import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingButton } from "@/components/dashboard/billing-buttons";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/validation";
import type { Suite, Transaction } from "@/lib/types";

export const metadata = { title: "Billing" };

const BILLING_LABELS: Record<Suite["billing_status"], string> = {
  none: "No plan yet",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

const TX_LABELS: Record<Transaction["kind"], string> = {
  member_payment: "Member payment",
  saas_payment: "Suite plan payment",
  payment_failed: "Payment failed",
  refund: "Refund",
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: monthTx }, { count: paidMembers }, { data: recentTx }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("amount_cents, kind")
        .eq("suite_id", suite.id)
        .eq("kind", "member_payment")
        .gte("created_at", monthStart.toISOString())
        .returns<Pick<Transaction, "amount_cents" | "kind">[]>(),
      supabase
        .from("memberships")
        .select("*", { count: "exact", head: true })
        .eq("suite_id", suite.id)
        .eq("tier", "paid")
        .in("status", ["active", "past_due"]),
      supabase
        .from("transactions")
        .select("*")
        .eq("suite_id", suite.id)
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<Transaction[]>(),
    ]);

  const monthRevenue = (monthTx ?? []).reduce(
    (sum, t) => sum + t.amount_cents,
    0
  );

  const hasSaasPlan =
    suite.billing_status !== "none" && suite.billing_status !== "canceled";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Your HouseKey plan, payouts, and member revenue.
        </p>
      </div>

      {/* A. HouseKey Suite plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>HouseKey Suite plan — $99/month</span>
            <span
              className={
                suite.billing_status === "past_due" ||
                suite.billing_status === "canceled"
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium text-muted-foreground"
              }
            >
              {BILLING_LABELS[suite.billing_status]}
            </span>
          </CardTitle>
          <CardDescription>
            {suite.billing_status === "none" &&
              "Start your Suite plan — 14-day free trial, card required, cancel anytime."}
            {suite.billing_status === "trialing" &&
              suite.trial_ends_at &&
              `Trial ends ${new Date(suite.trial_ends_at).toLocaleDateString()}.`}
            {suite.billing_status === "active" &&
              suite.current_period_end &&
              `Renews ${new Date(suite.current_period_end).toLocaleDateString()}.`}
            {suite.billing_status === "past_due" &&
              "Your last payment failed — update your card to keep your suite running."}
            {suite.billing_status === "canceled" &&
              "Your plan is canceled. Resubscribe to keep your suite running."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasSaasPlan ? (
            <BillingButton
              slug={suite.slug}
              kind="portal"
              label="Manage billing"
              variant="outline"
            />
          ) : suite.stripe_customer_id ? (
            <div className="flex flex-wrap gap-3">
              <BillingButton
                slug={suite.slug}
                kind="checkout"
                label="Resubscribe"
              />
              <BillingButton
                slug={suite.slug}
                kind="portal"
                label="Manage billing"
                variant="outline"
              />
            </div>
          ) : (
            <BillingButton
              slug={suite.slug}
              kind="checkout"
              label="Start 14-day trial"
            />
          )}
        </CardContent>
      </Card>

      {/* B. Payouts (Stripe Connect Express) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payouts</span>
            <span className="text-sm font-medium text-muted-foreground">
              {suite.connect_ready
                ? "✅ Payouts ready"
                : suite.stripe_connect_id
                  ? "⏳ Payouts pending"
                  : "Payouts not connected"}
            </span>
          </CardTitle>
          <CardDescription>
            {suite.connect_ready
              ? "Your Stripe account is ready — members can subscribe and revenue is paid out to you (minus the 10% platform fee)."
              : suite.stripe_connect_id
                ? "Stripe still needs information before payouts can start. Resume onboarding to finish."
                : suite.access === "paid"
                  ? "Connect a Stripe account to accept member subscriptions. Until then your suite shows “Membership coming soon.”"
                  : "Connect a Stripe account so you're ready if you switch to paid membership."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.connect_ready ? (
            <BillingButton
              slug={suite.slug}
              kind="connect"
              label="Update payout details"
              variant="outline"
            />
          ) : (
            <BillingButton
              slug={suite.slug}
              kind="connect"
              label={
                suite.stripe_connect_id
                  ? "Resume onboarding"
                  : "Connect payouts"
              }
            />
          )}
        </CardContent>
      </Card>

      {/* E. Revenue */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Member revenue this month</CardDescription>
            <CardTitle className="text-2xl">
              {formatPrice(monthRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active paid members</CardDescription>
            <CardTitle className="text-2xl">{paidMembers ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>
            Recorded from verified Stripe webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTx && recentTx.length > 0 ? (
            <ul className="space-y-2">
              {recentTx.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span
                      className={
                        tx.kind === "payment_failed" || tx.kind === "refund"
                          ? "font-medium text-destructive"
                          : "font-medium"
                      }
                    >
                      {TX_LABELS[tx.kind]}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div>{formatPrice(tx.amount_cents, tx.currency)}</div>
                    {tx.application_fee_cents !== null &&
                      tx.kind === "member_payment" && (
                        <div className="text-xs text-muted-foreground">
                          fee {formatPrice(tx.application_fee_cents, tx.currency)}
                        </div>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transactions yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
