"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSlugAction, createSuiteAction } from "@/app/new/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SLUG_REGEX, SUITE_TYPES, slugify } from "@/lib/validation";
import type { SuiteAccess, SuiteType } from "@/lib/types";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const STEPS = ["Name", "Type", "Access", "Branding", "Review"] as const;

export function OnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 — name & address
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");

  // Step 2 — suite type
  const [suiteType, setSuiteType] = useState<SuiteType>("creator");

  // Step 3 — access & price
  const [access, setAccess] = useState<SuiteAccess>("free");
  const [price, setPrice] = useState("9.00");

  // Step 4 — branding
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [brandColor, setBrandColor] = useState("#171717");
  const [useBrandColor, setUseBrandColor] = useState(false);

  // Step 5 — submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSeq = useRef(0);

  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      return;
    }
    if (!SLUG_REGEX.test(slug)) {
      setSlugStatus("invalid");
      return;
    }
    setSlugStatus("checking");
    const seq = ++checkSeq.current;
    const timer = setTimeout(async () => {
      const available = await checkSlugAction(slug);
      if (checkSeq.current === seq) {
        setSlugStatus(available ? "available" : "taken");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slug]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  const priceCents = Math.round(parseFloat(price || "0") * 100);
  const priceValid =
    access === "free" ||
    (Number.isFinite(priceCents) && priceCents >= 100 && priceCents <= 100_000_000);

  const canContinue =
    step === 0
      ? name.trim().length > 0 && slugStatus === "available"
      : step === 2
        ? priceValid
        : true;

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);

    try {
      let logoUrl: string | null = null;

      if (logoFile) {
        const supabase = createClient();
        const ext = logoFile.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("branding")
          .upload(path, logoFile, { upsert: false });
        if (uploadError) {
          setError(`Logo upload failed: ${uploadError.message}`);
          setSubmitting(false);
          return;
        }
        logoUrl = supabase.storage.from("branding").getPublicUrl(path)
          .data.publicUrl;
      }

      const result = await createSuiteAction({
        name,
        slug,
        suiteType,
        access,
        priceCents: access === "paid" ? priceCents : null,
        logoUrl,
        brandColor: useBrandColor ? brandColor : null,
      });

      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      router.push(`/dashboard/${result.slug}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="mb-2 flex gap-1">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        <CardTitle className="text-xl">
          {step === 0 && "Name your suite"}
          {step === 1 && "What kind of suite is it?"}
          {step === 2 && "Free or paid?"}
          {step === 3 && "Add your branding"}
          {step === 4 && "Review & generate"}
        </CardTitle>
        <CardDescription>
          Step {step + 1} of {STEPS.length}
        </CardDescription>
      </CardHeader>

      <CardContent className="min-h-56 space-y-4">
        {step === 0 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="suite-name">Suite name</Label>
              <Input
                id="suite-name"
                placeholder="The Willow House"
                maxLength={80}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suite-slug">Suite address</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/s/</span>
                <Input
                  id="suite-slug"
                  placeholder="the-willow-house"
                  maxLength={48}
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                />
              </div>
              <p
                className={cn(
                  "text-xs",
                  slugStatus === "available" && "text-green-600",
                  (slugStatus === "taken" || slugStatus === "invalid") &&
                    "text-destructive",
                  (slugStatus === "idle" || slugStatus === "checking") &&
                    "text-muted-foreground"
                )}
              >
                {slugStatus === "idle" &&
                  "Lowercase letters, numbers, and hyphens (3–48 characters)."}
                {slugStatus === "checking" && "Checking availability…"}
                {slugStatus === "available" && "✓ Available"}
                {slugStatus === "taken" && "✗ Taken or reserved — try another."}
                {slugStatus === "invalid" &&
                  "✗ Use 3–48 lowercase letters, numbers, and hyphens."}
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="space-y-2">
            {SUITE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSuiteType(t.value)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors hover:bg-accent",
                  suiteType === t.value && "border-primary ring-1 ring-primary"
                )}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-sm text-muted-foreground">
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["free", "paid"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAccess(a)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors hover:bg-accent",
                    access === a && "border-primary ring-1 ring-primary"
                  )}
                >
                  <div className="font-medium capitalize">{a}</div>
                  <div className="text-sm text-muted-foreground">
                    {a === "free"
                      ? "Anyone can join."
                      : "Members pay a monthly price."}
                  </div>
                </button>
              ))}
            </div>
            {access === "paid" && (
              <div className="space-y-2">
                <Label htmlFor="price">Monthly price (USD)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    id="price"
                    type="number"
                    min="1"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                {!priceValid && (
                  <p className="text-xs text-destructive">
                    Enter a price of at least $1.00.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Payments are set up in a later milestone — the price is
                  saved on your plan now.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="logo">Logo (optional)</Label>
              <Input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              {logoFile && (
                <p className="text-xs text-muted-foreground">
                  {logoFile.name} — uploaded when you generate the suite.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useBrandColor}
                  onChange={(e) => setUseBrandColor(e.target.checked)}
                />
                Use a brand color
              </Label>
              {useBrandColor && (
                <input
                  type="color"
                  aria-label="Brand color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer rounded-md border"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              You can skip this — branding can be added later.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <ReviewRow label="Name" value={name} />
            <ReviewRow label="Address" value={`/s/${slug}`} />
            <ReviewRow
              label="Type"
              value={SUITE_TYPES.find((t) => t.value === suiteType)?.label ?? ""}
            />
            <ReviewRow
              label="Access"
              value={
                access === "free"
                  ? "Free"
                  : `Paid — $${(priceCents / 100).toFixed(2)}/month`
              }
            />
            <ReviewRow
              label="Branding"
              value={
                [logoFile ? "logo" : null, useBrandColor ? brandColor : null]
                  .filter(Boolean)
                  .join(", ") || "skipped"
              }
            />
            <p className="text-xs text-muted-foreground">
              Generating your suite seeds its tabs and member rooms from the{" "}
              {suiteType} template.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continue
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={submitting}>
            {submitting ? "Generating…" : "Generate suite"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
