"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  connectPayouts,
  openOwnerBillingPortal,
  startOwnerCheckout,
} from "@/app/dashboard/billing-actions";

type Kind = "checkout" | "portal" | "connect";

const ACTIONS: Record<Kind, (slug: string) => Promise<{ ok: false; error: string }>> =
  {
    checkout: startOwnerCheckout,
    portal: openOwnerBillingPortal,
    connect: connectPayouts,
  };

export function BillingButton({
  slug,
  kind,
  label,
  variant = "default",
}: {
  slug: string;
  kind: Kind;
  label: string;
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // Each action redirects to Stripe; it only returns on failure.
            const result = await ACTIONS[kind](slug);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Redirecting…" : label}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
