"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { joinSuite } from "@/app/s/[slug]/actions";

interface JoinButtonProps {
  suiteId: string;
  slug: string;
  access: "free" | "paid";
  primaryColor: string;
  loggedIn: boolean;
  isOwner: boolean;
  isMember: boolean;
}

export function JoinButton({
  suiteId,
  slug,
  access,
  primaryColor,
  loggedIn,
  isOwner,
  isMember,
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

  if (isMember) {
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
    // Checkout arrives with the payments milestone.
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
