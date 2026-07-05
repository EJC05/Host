import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LockedPostCard } from "@/components/suite/locked-post-card";
import { VideoEmbed } from "@/components/suite/video-embed";
import { createClient } from "@/lib/supabase/server";
import type { Post, Suite } from "@/lib/types";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  const supabase = await createClient();

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  // Teaser row — RLS hides drafts from everyone but the owner.
  const { data: post } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("suite_id", suite.id)
    .maybeSingle<Post>();
  if (!post) notFound();

  // The permission check IS this query: RLS on post_bodies returns the row
  // only if the viewer may read it. A locked body never reaches the server
  // component, so it can never be serialized into the page.
  const { data: bodyRow } = await supabase
    .from("post_bodies")
    .select("body")
    .eq("post_id", post.id)
    .maybeSingle<{ body: string }>();

  const publishedDate = post.published_at
    ? new Date(post.published_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {post.pinned && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
              📌 Pinned
            </span>
          )}
          {post.status === "draft" && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
              Draft — only you can see this
            </span>
          )}
          {publishedDate && (
            <span className="text-muted-foreground">{publishedDate}</span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
        {post.excerpt && (
          <p className="text-lg text-muted-foreground">{post.excerpt}</p>
        )}
      </header>

      {post.media.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.media.image_url}
          alt=""
          className="w-full rounded-lg border object-cover"
        />
      )}

      {bodyRow ? (
        <>
          {post.media.video_url && <VideoEmbed url={post.media.video_url} />}
          <div className="whitespace-pre-wrap leading-relaxed">
            {bodyRow.body}
          </div>

          {/* Comments arrive with the community milestone. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comments</CardTitle>
              <CardDescription>
                Comments are coming soon to HouseKey suites.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                💬 Be the first to comment when this opens.
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <LockedPostCard post={post} suite={suite} />
      )}
    </article>
  );
}
