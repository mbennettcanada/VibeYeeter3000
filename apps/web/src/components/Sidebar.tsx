"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@vibeyeeter/types";
import { initials } from "@/lib/format";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h4A1.5 1.5 0 0 1 10 3.5v4A1.5 1.5 0 0 1 8.5 9h-4A1.5 1.5 0 0 1 3 7.5v-4Zm9 0A1.5 1.5 0 0 1 13.5 2h4A1.5 1.5 0 0 1 19 3.5v4A1.5 1.5 0 0 1 17.5 9h-4A1.5 1.5 0 0 1 12 7.5v-4Zm-9 9A1.5 1.5 0 0 1 4.5 11h4A1.5 1.5 0 0 1 10 12.5v4A1.5 1.5 0 0 1 8.5 18h-4A1.5 1.5 0 0 1 3 16.5v-4Zm9 0a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />
      </svg>
    ),
  },
  {
    href: "#",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l.68 1.178a1 1 0 0 1-.226 1.253l-1.293 1.12a7.055 7.055 0 0 1 0 2.228l1.293 1.12a1 1 0 0 1 .226 1.253l-.68 1.178a1 1 0 0 1-1.187.447l-1.597-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-.68-1.178a1 1 0 0 1 .226-1.253l1.293-1.12a7.055 7.055 0 0 1 0-2.228L2.844 6.912a1 1 0 0 1-.226-1.253l.68-1.178a1 1 0 0 1 1.187-.447l1.597.54A6.993 6.993 0 0 1 8.01 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
          V
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-white">
          VibeYeeter<span className="text-indigo-400">3000</span>
        </span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-in-out md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            V
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            VibeYeeter<span className="text-indigo-400">3000</span>
          </span>
        </div>

        <nav className="mt-2 flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const isDisabled = item.href === "#";
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-disabled={isDisabled}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isDisabled
                    ? "cursor-not-allowed text-sidebar-muted/50"
                    : isActive
                      ? "bg-sidebar-hover text-white"
                      : "text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
                {isDisabled && (
                  <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-muted/70">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
              {initials(user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.email}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {user.isAdmin ? "Admin" : "Member"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z"
                clipRule="evenodd"
              />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
