import type { SuiteAccess, SuiteType } from "@/lib/types";

// Must stay in sync with the check constraint on suites.slug (0001_init.sql).
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export const MIN_PRICE_CENTS = 100; // $1.00
export const MAX_PRICE_CENTS = 100_000_000;

export const SUITE_TYPES: {
  value: SuiteType;
  label: string;
  description: string;
}[] = [
  {
    value: "creator",
    label: "Creator",
    description: "Share your work, links, and updates with your audience.",
  },
  {
    value: "community",
    label: "Community",
    description: "A member-first space with rooms, intros, and events.",
  },
  {
    value: "business",
    label: "Business",
    description: "A home base for your services, support, and contact info.",
  },
];

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
