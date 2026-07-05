import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Membership, Post, Suite } from "@/lib/types";

export interface ViewerContext {
  user: User | null;
  isOwner: boolean;
  membership: Pick<Membership, "role" | "tier" | "status"> | null;
}

export async function getViewerContext(
  supabase: SupabaseClient,
  suite: Suite
): Promise<ViewerContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isOwner: false, membership: null };
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, tier, status")
    .eq("suite_id", suite.id)
    .eq("user_id", user.id)
    .maybeSingle<Pick<Membership, "role" | "tier" | "status">>();

  return { user, isOwner: suite.owner_id === user.id, membership };
}

// UI mirror of the database's can_read_post_body() — used only to decide
// which teaser cards show a lock badge. RLS on post_bodies remains the
// enforcement layer: locked bodies are never fetched, let alone rendered.
export function viewerCanReadBody(viewer: ViewerContext, post: Post): boolean {
  if (viewer.isOwner) return true;
  if (post.status !== "published") return false;
  switch (post.visibility) {
    case "public":
      return true;
    case "free_members":
      return viewer.membership !== null;
    case "paid_members":
      return (
        viewer.membership?.tier === "paid" &&
        (viewer.membership.status === "active" ||
          viewer.membership.status === "past_due")
      );
  }
}

export function lockLabel(post: Post): string {
  return post.visibility === "paid_members" ? "Paid members" : "Members";
}
