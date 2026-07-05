import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/suite/join-button";
import { SuiteNav } from "@/components/suite/nav";
import { getViewerContext } from "@/lib/suite-access";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Suite } from "@/lib/types";

// Themed shell for every public suite page. RLS makes unpublished suites
// visible only to their owner (preview) and members.
export default async function SuiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();

  if (!suite) {
    notFound();
  }

  const viewer = await getViewerContext(supabase, suite);
  const primary = suite.brand_color ?? "#171717";
  const accent = suite.accent_color ?? primary;

  return (
    <div className={cn(suite.theme === "dark" && "dark")}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {/* Cover */}
        {suite.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={suite.cover_image_url}
            alt=""
            className="h-40 w-full object-cover sm:h-52"
          />
        ) : (
          <div
            className="h-24 w-full sm:h-32"
            style={{
              background: `linear-gradient(120deg, ${primary}, ${accent})`,
            }}
          />
        )}

        {/* Header */}
        <header className="border-b">
          <div className="mx-auto w-full max-w-4xl px-4">
            <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
              <div className="flex items-end gap-4">
                {suite.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={suite.logo_url}
                    alt={`${suite.name} logo`}
                    className="-mt-8 h-16 w-16 rounded-xl border bg-background object-cover shadow-sm"
                  />
                ) : (
                  <div
                    className="-mt-8 flex h-16 w-16 items-center justify-center rounded-xl border text-xl font-bold text-white shadow-sm"
                    style={{ backgroundColor: primary }}
                  >
                    {suite.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="pb-1">
                  <h1 className="text-xl font-bold leading-tight tracking-tight">
                    {suite.name}
                  </h1>
                  {suite.tagline && (
                    <p className="text-sm text-muted-foreground">
                      {suite.tagline}
                    </p>
                  )}
                </div>
              </div>
              <div className="pb-1">
                <JoinButton
                  suiteId={suite.id}
                  slug={suite.slug}
                  access={suite.access}
                  connectReady={suite.connect_ready}
                  primaryColor={primary}
                  loggedIn={viewer.user !== null}
                  isOwner={viewer.isOwner}
                  isMember={viewer.membership !== null}
                  isPaidMember={
                    viewer.membership?.tier === "paid" &&
                    viewer.membership?.status !== "canceled"
                  }
                />
              </div>
            </div>
            <SuiteNav slug={suite.slug} accentColor={accent} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          {children}
        </main>

        <footer className="border-t">
          <div className="mx-auto w-full max-w-4xl px-4 py-4 text-xs text-muted-foreground">
            Powered by{" "}
            <Link href="/" className="underline underline-offset-4">
              HouseKey
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
