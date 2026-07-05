import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/content/post-composer";
import { createClient } from "@/lib/supabase/server";
import type { Suite } from "@/lib/types";

export const metadata = { title: "New post" };

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/${slug}/content/new`);

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PostComposer suite={suite} userId={user.id} />
    </div>
  );
}
