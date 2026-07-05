import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/nav";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import type { Suite } from "@/lib/types";

// Owner-only shell for all /dashboard/[slug]/* pages. Pages re-verify
// ownership implicitly through RLS on every query.
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/dashboard/${slug}`);
  }

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();

  if (!suite || suite.owner_id !== user.id) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="font-semibold tracking-tight">
                🏠 HouseKey
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-medium">{suite.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${suite.slug}`}>View public page</Link>
              </Button>
              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">
                  Log out
                </Button>
              </form>
            </div>
          </div>
          <DashboardNav slug={suite.slug} />
        </div>
      </header>
      {(suite.billing_status === "past_due" ||
        suite.billing_status === "canceled") && (
        <div className="border-b border-destructive/30 bg-destructive/10">
          <div className="mx-auto max-w-5xl px-4 py-2 text-sm">
            {suite.billing_status === "past_due"
              ? "⚠️ Your HouseKey plan payment failed. "
              : "⚠️ Your HouseKey plan is canceled. "}
            <Link
              href={`/dashboard/${suite.slug}/billing`}
              className="font-medium underline underline-offset-4"
            >
              Fix billing
            </Link>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
