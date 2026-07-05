import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PostCard } from "@/components/suite/post-card";
import { getViewerContext, viewerCanReadBody } from "@/lib/suite-access";
import { createClient } from "@/lib/supabase/server";
import type { Post, Suite } from "@/lib/types";

export default async function SuiteFeedPage({
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

  // RLS only returns published posts here (plus drafts for the owner, which
  // we exclude — drafts live in the dashboard).
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("suite_id", suite.id)
    .eq("status", "published")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .returns<Post[]>();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {posts && posts.length > 0 ? (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            slug={suite.slug}
            locked={!viewerCanReadBody(viewer, post)}
          />
        ))
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nothing posted yet — check back soon.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
