import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { lockLabel } from "@/lib/suite-access";
import type { Post, Suite } from "@/lib/types";

// Paywall/teaser card shown on the post detail page when the viewer lacks
// permission. The body was never fetched — RLS returned zero rows.
export function LockedPostCard({ post, suite }: { post: Post; suite: Suite }) {
  const paid = post.visibility === "paid_members";
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-xl">
          🔒
        </div>
        <CardTitle>This post is for {lockLabel(post).toLowerCase()}</CardTitle>
        <CardDescription>
          {paid
            ? `Unlock it with a paid membership to ${suite.name}.`
            : `Join ${suite.name} to read the full post.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {paid
            ? "Paid memberships open soon — check back shortly."
            : "Use the Join button above — it takes a few seconds."}
        </p>
      </CardContent>
    </Card>
  );
}
