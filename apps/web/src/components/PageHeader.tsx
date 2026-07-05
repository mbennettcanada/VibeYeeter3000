import type { ReactNode } from "react";

export function PageHeader({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 truncate text-sm text-slate-500">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      </div>
      {action && <div className="shrink-0 flex-wrap">{action}</div>}
    </div>
  );
}
