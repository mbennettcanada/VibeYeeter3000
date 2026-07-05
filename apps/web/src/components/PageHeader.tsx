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
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {breadcrumb && <div className="mb-1.5 text-sm text-slate-500">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
