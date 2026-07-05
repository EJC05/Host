"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SuiteNav({
  slug,
  accentColor,
}: {
  slug: string;
  accentColor: string;
}) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  const tabs = [
    { href: base, label: "Home", active: pathname === base },
    {
      href: `${base}/feed`,
      label: "Feed",
      active: pathname.startsWith(`${base}/feed`),
    },
    {
      href: `${base}/about`,
      label: "About",
      active: pathname === `${base}/about`,
    },
  ];

  return (
    <nav className="flex gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.active
              ? "text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          style={tab.active ? { borderBottomColor: accentColor } : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
