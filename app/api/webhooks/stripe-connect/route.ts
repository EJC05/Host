import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleConnectEvent } from "@/lib/stripe-webhooks";

export const runtime = "nodejs";

// Connect webhook: account.updated → suite payout readiness.
// Same claim/release idempotency protocol as /api/webhooks/stripe.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
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
    await handleConnectEvent(admin, event);
  } catch (err) {
    await admin.rpc("release_stripe_event", { p_event_id: event.id });
    console.error(`stripe connect webhook ${event.type} failed:`, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
