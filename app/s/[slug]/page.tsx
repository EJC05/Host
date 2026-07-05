import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, suiteTypeLabel } from "@/lib/validation";
import type { Plan, Suite, SuiteTab } from "@/lib/types";

// Public suite page — works for anonymous visitors. RLS only exposes
// published suites, their public tabs, and their pricing here.
export default async function PublicSuitePage({
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
    .eq("published", true)
    .maybeSingle<Suite>();

  if (!suite) {
    notFound();
  }

  const [{ data: tabs }, { data: plans }] = await Promise.all([
    supabase
      .from("suite_tabs")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("is_public", true)
      .order("position")
      .returns<SuiteTab[]>(),
    supabase
      .from("plans")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("is_active", true)
      .returns<Plan[]>(),
  ]);

  const plan = plans?.[0];
  const accent = suite.brand_color ?? "#171717";

  return (
    <div className="min-h-screen">
      <div className="h-2" style={{ backgroundColor: accent }} />
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {suite.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={suite.logo_url}
                alt=""
                className="h-9 w-9 rounded-md border object-cover"
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {suite.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-semibold">{suite.name}</span>
          </div>
          <nav className="hidden gap-4 text-sm text-muted-foreground sm:flex">
            {tabs?.map((tab) => (
              <span key={tab.id}>{tab.title}</span>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome to {suite.name}
        </h1>
        <p className="mt-3 text-muted-foreground">
          A {suiteTypeLabel(suite.suite_type)} suite on HouseKey.
        </p>

        <Card className="mx-auto mt-10 max-w-sm">
          <CardHeader>
            <CardTitle>
              {suite.access === "paid" && plan
                ? `${formatPrice(plan.price_cents, plan.currency)}/${plan.billing_interval}`
                : "Free to join"}
            </CardTitle>
            <CardDescription>
              {suite.access === "paid"
                ? "Membership unlocks the member rooms."
                : "Join and get access to the member rooms."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Joining & payments arrive in a later milestone. */}
            <Button className="w-full" disabled>
              Joining opens soon
            </Button>
          </CardContent>
        </Card>

        <p className="mt-16 text-xs text-muted-foreground">
          Powered by{" "}
          <Link href="/" className="underline underline-offset-4">
            HouseKey
          </Link>
        </p>
      </main>
    </div>
  );
}
