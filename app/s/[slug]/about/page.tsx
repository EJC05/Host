import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { suiteTypeLabel } from "@/lib/validation";
import type { Suite } from "@/lib/types";

export default async function SuiteAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">
        About {suite.name}
      </h2>
      {suite.about ? (
        <p className="whitespace-pre-wrap leading-relaxed">{suite.about}</p>
      ) : (
        <p className="text-muted-foreground">
          {suite.name} is a {suiteTypeLabel(suite.suite_type).toLowerCase()}{" "}
          suite on HouseKey.
          {suite.tagline && ` ${suite.tagline}`}
        </p>
      )}
    </div>
  );
}
