import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { handlePlatformEvent } from "@/lib/stripe-webhooks";

export const runtime = "nodejs";

// Platform webhook: SaaS billing, member subscriptions, invoices, refunds.
//
// Idempotency protocol: verify signature → claim event id in stripe_events
// (duplicate ⇒ 200 skip) → process → on failure release the claim and
// return 500 so Stripe retries.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      signature,
      secret
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: firstDelivery, error: claimError } = await admin.rpc(
    "record_stripe_event",
    { p_event_id: event.id, p_type: event.type }
  );
  if (claimError) {
    return NextResponse.json({ error: "ledger unavailable" }, { status: 500 });
  }
  if (!firstDelivery) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handlePlatformEvent(admin, event);
  } catch (err) {
    await admin.rpc("release_stripe_event", { p_event_id: event.id });
    console.error(`stripe webhook ${event.type} failed:`, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
