import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManageSubscriptionButton } from "@/components/account/manage-subscription-button";
import { createClient } from "@/lib/supabase/server";
import type { Membership } from "@/lib/types";

export const metadata = { title: "Your memberships" };

interface MembershipWithSuite extends Membership {
  suites: { name: string; slug: string } | null;
}

export default async function AccountBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*, suites (name, slug)")
    .eq("user_id", user.id)
    .order("created_at")
    .returns<MembershipWithSuite[]>();

  const paid = (memberships ?? []).filter(
    (m) => m.stripe_subscription_id !== null
  );
  const free = (memberships ?? []).filter(
    (m) => m.stripe_subscription_id === null && m.role !== "owner"
  );
  const hasBilling = paid.length > 0;

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Your memberships
          </h1>
          <p className="text-sm text-muted-foreground">
            Subscriptions and suites you&apos;ve joined.
          </p>
        </div>
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Home
        </Link>
      </div>

      {paid.map((m) => (
        <Card key={m.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{m.suites?.name ?? "Suite"}</span>
              <span className="text-sm font-normal capitalize text-muted-foreground">
                {m.tier === "paid" ? m.status.replace("_", " ") : "canceled"}
              </span>
            </CardTitle>
            <CardDescription>
              {m.cancel_at_period_end && m.status === "active"
                ? `Cancels at period end${m.current_period_end ? ` — access until ${new Date(m.current_period_end).toLocaleDateString()}` : ""}.`
                : m.current_period_end && m.status !== "canceled"
                  ? `Renews ${new Date(m.current_period_end).toLocaleDateString()}.`
                  : m.status === "canceled" || m.tier === "free"
                    ? "Subscription ended — you remain a free member."
                    : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Link
              href={`/s/${m.suites?.slug}`}
              className="text-sm underline underline-offset-4"
            >
              Visit suite
            </Link>
          </CardContent>
        </Card>
      ))}

      {hasBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage subscriptions</CardTitle>
            <CardDescription>
              Update your card, view invoices, or cancel in the Stripe
              customer portal. Cancellations keep access until the end of the
              billing period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManageSubscriptionButton />
          </CardContent>
        </Card>
      )}

      {free.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Free memberships</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {free.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{m.suites?.name ?? "Suite"}</span>
                <Link
                  href={`/s/${m.suites?.slug}`}
                  className="text-xs underline underline-offset-4"
                >
                  Visit
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!hasBilling && free.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t joined any suites yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
