import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/content/post-composer";
import { createClient } from "@/lib/supabase/server";
import type { Post, Suite } from "@/lib/types";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/${slug}/content/${id}`);

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  const [{ data: post }, { data: bodyRow }] = await Promise.all([
    supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .eq("suite_id", suite.id)
      .maybeSingle<Post>(),
    supabase
      .from("post_bodies")
      .select("body")
      .eq("post_id", id)
      .maybeSingle<{ body: string }>(),
  ]);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PostComposer
        suite={suite}
        userId={user.id}
        post={post}
        initialBody={bodyRow?.body ?? ""}
      />
    </div>
  );
}
