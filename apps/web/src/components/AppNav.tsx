"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/deployments", label: "Deployments" },
  { href: "/secrets", label: "Secrets" },
  { href: "/domains", label: "Domains" },
  { href: "/terraform", label: "Terraform" },
  { href: "/logs", label: "Logs" },
];

export function AppNav({ appId }: { appId: string }) {
  const pathname = usePathname();
  const base = `/apps/${appId}`;

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
