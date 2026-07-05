import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, suiteTypeLabel } from "@/lib/validation";
import type { Plan, Room, Suite, SuiteTab } from "@/lib/types";

export default async function SuiteDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // The layout already gates on ownership; RLS re-enforces on every query.
  const { data: suite } = await supabase
    .from("suites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Suite>();
  if (!suite) notFound();

  const [
    { data: tabs },
    { data: rooms },
    { count: memberCount },
    { count: postCount },
    { data: plans },
  ] = await Promise.all([
    supabase
      .from("suite_tabs")
      .select("*")
      .eq("suite_id", suite.id)
      .order("position")
      .returns<SuiteTab[]>(),
    supabase
      .from("rooms")
      .select("*")
      .eq("suite_id", suite.id)
      .order("position")
      .returns<Room[]>(),
    supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("suite_id", suite.id),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("suite_id", suite.id),
    supabase
      .from("plans")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("is_active", true)
      .returns<Plan[]>(),
  ]);

  const plan = plans?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {suite.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={suite.logo_url}
            alt=""
            className="h-12 w-12 rounded-lg border object-cover"
          />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg border text-lg font-semibold"
            style={
              suite.brand_color
                ? { backgroundColor: suite.brand_color, color: "#fff" }
                : undefined
            }
          >
            {suite.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{suite.name}</h1>
          <p className="text-sm text-muted-foreground">
            housekey.app/s/{suite.slug} · {suiteTypeLabel(suite.suite_type)}{" "}
            suite
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Access</CardDescription>
            <CardTitle className="text-2xl capitalize">
              {suite.access}
              {plan && suite.access === "paid" && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  {formatPrice(plan.price_cents, plan.currency)}/
                  {plan.billing_interval}
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Members</CardDescription>
            <CardTitle className="text-2xl">{memberCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Posts</CardDescription>
            <CardTitle className="text-2xl">{postCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-2xl">
              {suite.published ? "Published" : "Draft"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Write posts for everyone, free members, or paid members.
            </CardDescription>
          </div>
          <Button asChild size="sm">
            <Link href={`/dashboard/${suite.slug}/content/new`}>
              New post
            </Link>
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>
              Navigation of your suite. Editing comes in a later milestone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tabs?.map((tab) => (
                <li
                  key={tab.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{tab.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {tab.is_public ? "public" : "members"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rooms</CardTitle>
            <CardDescription>
              Member-only rooms seeded from your template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {rooms?.map((room) => (
                <li
                  key={room.id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div>{room.name}</div>
                  {room.description && (
                    <div className="text-xs text-muted-foreground">
                      {room.description}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
