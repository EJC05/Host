"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deletePost, savePost } from "@/app/dashboard/content-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Post, PostVisibility, Suite } from "@/lib/types";

const VISIBILITY_OPTIONS: {
  value: PostVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public",
    description: "Everyone can read it, even logged out.",
  },
  {
    value: "free_members",
    label: "Free members",
    description: "Members see it; visitors see a locked teaser.",
  },
  {
    value: "paid_members",
    label: "Paid members",
    description: "Paid members see it; everyone else sees a locked teaser.",
  },
];

export function PostComposer({
  suite,
  userId,
  post,
  initialBody,
}: {
  suite: Suite;
  userId: string;
  post?: Post;
  initialBody?: string;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [imageUrl, setImageUrl] = useState(post?.media.image_url ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState(post?.media.video_url ?? "");
  const [visibility, setVisibility] = useState<PostVisibility>(
    post?.visibility ?? "public"
  );
  const [publish, setPublish] = useState(post?.status === "published");
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      let finalImageUrl = imageUrl || null;

      if (imageFile) {
        const supabase = createClient();
        const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, imageFile);
        if (uploadError) {
          setError(`Image upload failed: ${uploadError.message}`);
          setSaving(false);
          return;
        }
        finalImageUrl = supabase.storage.from("media").getPublicUrl(path)
          .data.publicUrl;
      }

      const result = await savePost({
        postId: post?.id ?? null,
        suiteId: suite.id,
        suiteSlug: suite.slug,
        title,
        excerpt,
        body,
        imageUrl: finalImageUrl,
        videoUrl: videoUrl || null,
        visibility,
        status: publish ? "published" : "draft",
        pinned,
      });

      // savePost redirects on success; reaching here means failure.
      setError(result.error);
      setSaving(false);
    } catch (e) {
      // Next.js redirect() propagates as a thrown control-flow error.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!post) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const result = await deletePost(post.id, suite.slug);
      setError(result.error);
      setDeleting(false);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("Could not delete the post.");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {post ? "Edit post" : "New post"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="post-title">Title</Label>
          <Input
            id="post-title"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's this post about?"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-body">Body</Label>
          <textarea
            id="post-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Write your post…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-excerpt">Excerpt</Label>
          <textarea
            id="post-excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Short teaser shown in the feed — visible even when the post is locked."
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="post-image">Image</Label>
            {imageUrl && !imageFile && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="h-14 w-20 rounded-md border object-cover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setImageUrl("")}
                >
                  Remove
                </Button>
              </div>
            )}
            <Input
              id="post-image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="post-video">Video embed URL</Label>
            <Input
              id="post-video"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or vimeo.com/…"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Who can read it?</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {VISIBILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setVisibility(option.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                  visibility === option.value &&
                    "border-primary ring-1 ring-primary"
                )}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Published
            <span className="font-normal text-muted-foreground">
              (unchecked = draft, visible only to you)
            </span>
          </Label>
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            📌 Pin to top
          </Label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="justify-between">
        {post ? (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            {deleting ? "Deleting…" : "Delete post"}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handleSave} disabled={saving || deleting}>
          {saving
            ? "Saving…"
            : publish
              ? post?.status === "published"
                ? "Save changes"
                : "Publish"
              : "Save draft"}
        </Button>
      </CardFooter>
    </Card>
  );
}
