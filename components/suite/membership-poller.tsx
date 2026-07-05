"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMembershipState } from "@/app/s/[slug]/actions";

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 48; // ~2 minutes

type PollState = "confirming" | "confirmed" | "timeout";

export function MembershipPoller({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<PollState>("confirming");
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      attempts.current += 1;

      const membership = await getMembershipState(slug);
      if (cancelled) return;

      if (membership?.tier === "paid" && membership.status === "active") {
        setState("confirmed");
        router.refresh();
        return;
      }
      if (attempts.current >= MAX_ATTEMPTS) {
        setState("timeout");
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  return (
    <Card className="mx-auto max-w-md text-center">
      {state === "confirming" && (
        <>
          <CardHeader>
            <CardTitle>Confirming your payment…</CardTitle>
            <CardDescription>
              Waiting for Stripe to confirm your subscription. This usually
              takes a few seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </CardContent>
        </>
      )}

      {state === "confirmed" && (
        <>
          <CardHeader>
            <CardTitle>🎉 You&apos;re in!</CardTitle>
            <CardDescription>
              Your paid membership is active — members-only posts are now
              unlocked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/s/${slug}/feed`}>Go to the feed</Link>
            </Button>
          </CardContent>
        </>
      )}

      {state === "timeout" && (
        <>
          <CardHeader>
            <CardTitle>Still confirming</CardTitle>
            <CardDescription>
              Your payment went through but the confirmation is taking longer
              than usual. Your access will unlock automatically as soon as
              Stripe finishes — check back in a minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/s/${slug}`}>Back to the suite</Link>
            </Button>
          </CardContent>
        </>
      )}
    </Card>
  );
}
