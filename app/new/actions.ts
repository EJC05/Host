"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isSuiteAccess,
  isSuiteType,
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  SLUG_REGEX,
} from "@/lib/validation";
import type { Suite } from "@/lib/types";

export async function checkSlugAction(slug: string): Promise<boolean> {
  if (!SLUG_REGEX.test(slug)) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("slug_available", { p_slug: slug });
  return data === true;
}

export interface CreateSuiteInput {
  name: string;
  slug: string;
  suiteType: string;
  access: string;
  priceCents: number | null;
  logoUrl: string | null;
  brandColor: string | null;
}

export type CreateSuiteResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const ERROR_MESSAGES: Record<string, string> = {
  slug_reserved: "That address is reserved. Please pick another one.",
  slug_taken: "That address is already taken. Please pick another one.",
  invalid_slug:
    "Addresses must be 3–48 characters: lowercase letters, numbers, and hyphens.",
  invalid_name: "Please give your suite a name (max 80 characters).",
  invalid_price: "Paid suites need a price between $1 and $1,000,000.",
  not_authenticated: "You need to be logged in to create a suite.",
};

function friendlyError(message: string): string {
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(key)) return value;
  }
  return "Something went wrong creating your suite. Please try again.";
}

export async function createSuiteAction(
  input: CreateSuiteInput
): Promise<CreateSuiteResult> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: ERROR_MESSAGES.invalid_name };
  }
  if (!SLUG_REGEX.test(input.slug)) {
    return { ok: false, error: ERROR_MESSAGES.invalid_slug };
  }
  if (!isSuiteType(input.suiteType) || !isSuiteAccess(input.access)) {
    return { ok: false, error: "Invalid suite configuration." };
  }
  if (
    input.access === "paid" &&
    (input.priceCents === null ||
      !Number.isInteger(input.priceCents) ||
      input.priceCents < MIN_PRICE_CENTS ||
      input.priceCents > MAX_PRICE_CENTS)
  ) {
    return { ok: false, error: ERROR_MESSAGES.invalid_price };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_suite_with_defaults", {
      p_name: name,
      p_slug: input.slug,
      p_suite_type: input.suiteType,
      p_access: input.access,
      p_price_cents: input.access === "paid" ? input.priceCents : null,
      p_logo_url: input.logoUrl,
      p_brand_color: input.brandColor,
    })
    .single<Suite>();

  if (error || !data) {
    return { ok: false, error: friendlyError(error?.message ?? "") };
  }

  return { ok: true, slug: data.slug };
}
