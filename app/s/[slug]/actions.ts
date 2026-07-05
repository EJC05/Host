"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type JoinResult = { ok: true } | { ok: false; error: string };

// Free self-join. RLS enforces: published free suites only, role=member,
// tier=free. Paid membership arrives with the payments milestone.
export async function joinSuite(
  suiteId: string,
  slug: string
): Promise<JoinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to be logged in to join." };
  }

  const { error } = await supabase.from("memberships").insert({
    suite_id: suiteId,
    user_id: user.id,
    role: "member",
    tier: "free",
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true }; // already a member
    }
    return { ok: false, error: "Could not join this suite." };
  }

  revalidatePath(`/s/${slug}`, "layout");
  return { ok: true };
}
