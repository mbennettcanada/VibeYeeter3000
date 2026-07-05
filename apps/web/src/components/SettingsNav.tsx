"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/teams", label: "Teams" },
  { href: "/settings/tokens", label: "API Tokens" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 md:w-48 md:shrink-0 md:flex-col md:gap-0.5 md:border-b-0 md:border-r md:border-slate-200 md:pb-0 md:pr-4">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
