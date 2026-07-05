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
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
