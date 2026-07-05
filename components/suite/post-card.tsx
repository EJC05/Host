import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { lockLabel } from "@/lib/suite-access";
import type { Post } from "@/lib/types";

// Teaser card. `locked` only toggles the badge/CTA — this component never
// receives a body; locked bodies are filtered out by RLS server-side.
export function PostCard({
  post,
  slug,
  locked,
}: {
  post: Post;
  slug: string;
  locked: boolean;
}) {
  return (
    <Link href={`/s/${slug}/feed/${post.id}`} className="block">
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        {post.media.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.media.image_url}
            alt=""
            className="h-44 w-full border-b object-cover"
          />
        )}
        <CardContent className="space-y-2 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {post.pinned && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                📌 Pinned
              </span>
            )}
            {post.status === "draft" && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                Draft
              </span>
            )}
            {locked && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                🔒 {lockLabel(post)}
              </span>
            )}
            {post.published_at && (
              <span className="text-muted-foreground">
                {new Date(post.published_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
          <h3 className="font-semibold leading-snug">{post.title}</h3>
          {post.excerpt && (
            <p className="text-sm text-muted-foreground">{post.excerpt}</p>
          )}
          {locked && (
            <p className="text-xs font-medium text-muted-foreground">
              {post.visibility === "paid_members"
                ? "Unlock with a paid membership"
                : "Join to read the full post"}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
