import type { ReactNode } from "react";
import { SettingsNav } from "@/components/SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <SettingsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
