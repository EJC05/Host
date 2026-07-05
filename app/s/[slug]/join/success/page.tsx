import { MembershipPoller } from "@/components/suite/membership-poller";

export const metadata = { title: "Confirming your membership" };

// Landing page after Stripe Checkout. It POLLS membership state — the
// redirect alone is never trusted; only the webhook grants access.
export default async function JoinSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <MembershipPoller slug={slug} />;
}
