import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sends the user to their first suite's dashboard, or to onboarding if they
// don't own one yet.
export default async function DashboardIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: suite } = await supabase
    .from("suites")
    .select("slug")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  redirect(suite ? `/dashboard/${suite.slug}` : "/new");
}
