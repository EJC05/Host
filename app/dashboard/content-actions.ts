"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PostMedia } from "@/lib/types";

export interface SavePostInput {
  postId: string | null; // null = create
  suiteId: string;
  suiteSlug: string;
  title: string;
  excerpt: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  visibility: string;
  status: string;
  pinned: boolean;
}

export type SavePostResult = { ok: false; error: string };

const VISIBILITIES = ["public", "free_members", "paid_members"];
const STATUSES = ["draft", "published"];

// All writes here are enforced by RLS (suite owner only) — validation is UX.
export async function savePost(input: SavePostInput): Promise<SavePostResult> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) {
    return { ok: false, error: "Title is required (max 200 characters)." };
  }
  if (input.excerpt.length > 300) {
    return { ok: false, error: "Excerpt is too long (max 300 characters)." };
  }
  if (!VISIBILITIES.includes(input.visibility)) {
    return { ok: false, error: "Invalid visibility." };
  }
  if (!STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You need to be logged in." };
  }

  const media: PostMedia = {};
  if (input.imageUrl) media.image_url = input.imageUrl;
  if (input.videoUrl) media.video_url = input.videoUrl.trim();

  const fields = {
    title,
    excerpt: input.excerpt.trim() || null,
    media,
    visibility: input.visibility,
    status: input.status,
    pinned: input.pinned,
  };

  let postId = input.postId;

  if (postId) {
    const { error } = await supabase
      .from("posts")
      .update(fields)
      .eq("id", postId)
      .eq("suite_id", input.suiteId)
      .select("id")
      .single();
    if (error) {
      return { ok: false, error: "Could not save the post." };
    }
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...fields, suite_id: input.suiteId, author_id: user.id })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false, error: "Could not create the post." };
    }
    postId = data.id;
  }

  const { error: bodyError } = await supabase
    .from("post_bodies")
    .upsert({ post_id: postId, body: input.body });
  if (bodyError) {
    return { ok: false, error: "Could not save the post body." };
  }

  revalidatePath(`/s/${input.suiteSlug}`, "layout");
  redirect(`/dashboard/${input.suiteSlug}/content`);
}

export async function deletePost(
  postId: string,
  suiteSlug: string
): Promise<SavePostResult> {
  const supabase = await createClient();

  // post_bodies cascades from posts.
  const { error, count } = await supabase
    .from("posts")
    .delete({ count: "exact" })
    .eq("id", postId);

  if (error || !count) {
    return { ok: false, error: "Could not delete the post." };
  }

  revalidatePath(`/s/${suiteSlug}`, "layout");
  redirect(`/dashboard/${suiteSlug}/content`);
}
