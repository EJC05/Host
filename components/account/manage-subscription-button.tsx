"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { openMemberBillingPortal } from "@/app/account/actions";

export function ManageSubscriptionButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // Redirects to the Stripe portal on success (resolves undefined);
            // a returned object means failure.
            const result = await openMemberBillingPortal();
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Opening…" : "Open billing portal"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
