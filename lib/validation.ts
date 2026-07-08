import type { SuiteAccess, SuiteType } from "@/lib/types";

// Must stay in sync with the check constraint on suites.slug (0001_init.sql).
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

// Sanitizes a `next` redirect param: only same-origin absolute paths are
// allowed. Rejects protocol-relative ("//evil.com", "/\evil.com") and
// absolute URLs, which otherwise pass a bare startsWith("/") check and send
// a freshly-authenticated user off-site.
export function safeNextPath(
  next: string | null | undefined,
  fallback: string
): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
  ) {
    return next;
  }
  return fallback;
}

export const MIN_PRICE_CENTS = 100; // $1.00
export const MAX_PRICE_CENTS = 100_000_000;

// Launch templates — must stay in sync with docs/housekey-prd.md §4 and the
// suite_type enum + seeds in supabase/migrations/0001_init.sql.
export const SUITE_TYPES: {
  value: SuiteType;
  label: string;
  description: string;
}[] = [
  {
    value: "real_estate_agent",
    label: "Real Estate Agent",
    description:
      "A client hub with listings, market updates, and buyer Q&A.",
  },
  {
    value: "creator_influencer",
    label: "Creator / Influencer",
    description: "Share your work, links, and updates with your audience.",
  },
  {
    value: "coach_consultant",
    label: "Coach / Consultant",
    description: "A client space for programs, Q&A, and celebrating wins.",
  },
  {
    value: "business_brand",
    label: "Business / Brand",
    description: "A home base for your services, support, and contact info.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Start minimal and shape the suite yourself.",
  },
];

export function suiteTypeLabel(value: string): string {
  return SUITE_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function isSuiteType(value: string): value is SuiteType {
  return SUITE_TYPES.some((t) => t.value === value);
}

export function isSuiteAccess(value: string): value is SuiteAccess {
  return value === "free" || value === "paid";
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function formatPrice(priceCents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  }).format(priceCents / 100);
}
