"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { joinSuite, startMemberCheckout } from "@/app/s/[slug]/actions";

interface JoinButtonProps {
  suiteId: string;
  slug: string;
  access: "free" | "paid";
  connectReady: boolean;
  primaryColor: string;
  loggedIn: boolean;
  isOwner: boolean;
  isMember: boolean;
  isPaidMember: boolean;
}

export function JoinButton({
  suiteId,
  slug,
  access,
  connectReady,
  primaryColor,
  loggedIn,
  isOwner,
  isMember,
  isPaidMember,
}: JoinButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isOwner) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/dashboard/${slug}`}>Manage suite</Link>
      </Button>
    );
  }

  if (isPaidMember) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          ✓ Paid member
        </Button>
        <Link
          href="/account/billing"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Manage
        </Link>
      </div>
    );
  }

  // Free member of a paid suite can still upgrade below; free suite member
  // is simply done.
  if (isMember && access === "free") {
    return (
      <Button variant="outline" size="sm" disabled>
        ✓ Member
      </Button>
    );
  }

  if (!loggedIn) {
    return (
      <Button asChild size="sm" style={{ backgroundColor: primaryColor }}>
        <Link href={`/signup?next=/s/${slug}`}>Join</Link>
      </Button>
    );
  }

  if (access === "paid") {
    // A paid suite cannot accept member payments until payouts are ready.
    if (!connectReady) {
      return (
        <Button size="sm" disabled>
          Membership coming soon
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button
          size="sm"
          disabled={pending}
          style={{ backgroundColor: primaryColor }}
          onClick={() =>
            startTransition(async () => {
              // Redirects to Stripe Checkout; only returns on failure.
              const result = await startMemberCheckout(slug);
              if (!result.ok) setError(result.error);
            })
          }
        >
          {pending ? "Redirecting…" : "Subscribe"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        disabled={pending}
        style={{ backgroundColor: primaryColor }}
        onClick={() =>
          startTransition(async () => {
            const result = await joinSuite(suiteId, slug);
            if (!result.ok) {
              setError(result.error);
            } else {
              router.refresh();
            }
          })
        }
      >
        {pending ? "Joining…" : "Join free"}
      </Button>
    </div>
  );
}
