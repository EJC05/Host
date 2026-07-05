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
import { PostCard } from "@/components/suite/post-card";
import { getViewerContext, viewerCanReadBody } from "@/lib/suite-access";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/validation";
import type { Plan, Post, Suite } from "@/lib/types";

// Suite home: pinned + latest posts and the membership card.
export default async function SuiteHomePage({
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

  const viewer = await getViewerContext(supabase, suite);

  const [{ data: posts }, { data: plans }] = await Promise.all([
    supabase
      .from("posts")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("status", "published")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(3)
      .returns<Post[]>(),
    supabase
      .from("plans")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("is_active", true)
      .returns<Plan[]>(),
  ]);

  const plan = plans?.[0];

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Latest posts</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/s/${suite.slug}/feed`}>View all →</Link>
          </Button>
        </div>
        {posts && posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                slug={suite.slug}
                locked={!viewerCanReadBody(viewer, post)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing posted yet — check back soon.
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              {suite.access === "paid" && plan
                ? `${formatPrice(plan.price_cents, plan.currency)}/${plan.billing_interval}`
                : "Free to join"}
            </CardTitle>
            <CardDescription>
              {suite.access === "paid"
                ? "Membership unlocks members-only posts and rooms."
                : "Join to unlock members-only posts and rooms."}
            </CardDescription>
          </CardHeader>
        </Card>
        {suite.about && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
              <CardDescription className="line-clamp-4 whitespace-pre-wrap">
                {suite.about}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/s/${suite.slug}/about`}
                className="text-sm underline underline-offset-4"
              >
                Read more
              </Link>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}
