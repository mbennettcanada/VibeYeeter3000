import Link from "next/link";
import type { MockApp } from "@/lib/mock-data";
import { getMockDeployments } from "@/lib/mock-data";
import { timeAgo, truncateTag } from "@/lib/format";
import { StatusDot } from "@/components/StatusDot";

export function AppCard({ app }: { app: MockApp }) {
  const latestDeployment = getMockDeployments(app.id)[0];

  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <Link
            href={`/apps/${app.id}`}
            className="text-base font-semibold text-slate-900 hover:text-indigo-600"
          >
            {app.name}
          </Link>
          <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {app.teamName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <StatusDot status={app.latestDeploymentStatus} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-400">Image tag</dt>
        <dd className="text-right font-mono text-xs text-slate-700">
          {truncateTag(latestDeployment?.imageTag ?? "—")}
        </dd>
        <dt className="text-slate-400">Last deployed</dt>
        <dd className="text-right text-slate-700">{timeAgo(app.updatedAt)}</dd>
        <dt className="text-slate-400">Pods</dt>
        <dd className="text-right text-slate-700">
          {app.podsRunning} / {app.podsDesired}
        </dd>
      </dl>

      <a
        href={`https://${app.subdomain}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex items-center gap-1.5 truncate text-sm text-indigo-600 hover:text-indigo-500 hover:underline"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
          <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
        </svg>
        <span className="truncate">{app.subdomain}</span>
      </a>

      <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
        <Link href={`/apps/${app.id}/deployments`} className="hover:text-slate-900">
          Deployments
        </Link>
        <Link href={`/apps/${app.id}/secrets`} className="hover:text-slate-900">
          Secrets
        </Link>
        <Link href={`/apps/${app.id}/terraform`} className="hover:text-slate-900">
          Terraform
        </Link>
      </div>
    </div>
  );
}
