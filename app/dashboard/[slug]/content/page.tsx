import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Post, Suite } from "@/lib/types";

const VISIBILITY_LABELS: Record<Post["visibility"], string> = {
  public: "Public",
  free_members: "Free members",
  paid_members: "Paid members",
};

export default async function ContentListPage({
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

  // Owner sees everything, drafts included (RLS).
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("suite_id", suite.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Post[]>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground">
            Posts on your suite&apos;s feed.
          </p>
        </div>
        <Button asChild>
          <Link href={`/dashboard/${suite.slug}/content/new`}>New post</Link>
        </Button>
      </div>

      {posts && posts.length > 0 ? (
        <div className="space-y-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/dashboard/${suite.slug}/content/${post.id}`}
              className="block"
            >
              <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-accent">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {post.pinned && <span className="text-xs">📌</span>}
                    <span className="truncate font-medium">{post.title}</span>
                  </div>
                  {post.excerpt && (
                    <p className="truncate text-sm text-muted-foreground">
                      {post.excerpt}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span
                    className={
                      post.status === "published"
                        ? "rounded-full bg-secondary px-2 py-0.5 font-medium"
                        : "rounded-full border border-dashed px-2 py-0.5 font-medium text-muted-foreground"
                    }
                  >
                    {post.status === "published" ? "Published" : "Draft"}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    {VISIBILITY_LABELS[post.visibility]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No posts yet. Write your first one — public posts appear on
              your suite&apos;s feed for everyone.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/dashboard/${suite.slug}/content/new`}>
                Write your first post
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
