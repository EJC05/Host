"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function DashboardNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${slug}`;

  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    {
      href: `${base}/content`,
      label: "Content",
      active: pathname.startsWith(`${base}/content`),
    },
    {
      href: `${base}/billing`,
      label: "Billing",
      active: pathname.startsWith(`${base}/billing`),
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
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
