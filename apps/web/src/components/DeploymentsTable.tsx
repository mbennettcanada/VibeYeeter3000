import type { Deployment } from "@vibeyeeter/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { formatDuration, timeAgo, truncateTag } from "@/lib/format";

export function DeploymentsTable({
  deployments,
  showActions = false,
}: {
  deployments: Deployment[];
  showActions?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Image tag
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Commit
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Triggered by
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Duration
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              When
            </th>
            {showActions && (
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {deployments.map((deployment) => (
            <tr key={deployment.id} className="hover:bg-slate-50/75">
              <td className="whitespace-nowrap px-4 py-3">
                <StatusBadge status={deployment.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                {truncateTag(deployment.imageTag)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                <a
                  href="#"
                  className="text-indigo-600 hover:text-indigo-500 hover:underline"
                >
                  {truncateTag(deployment.imageTag)}
                </a>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {deployment.triggeredBy}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {formatDuration(deployment.duration)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                {timeAgo(deployment.createdAt)}
              </td>
              {showActions && (
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Button variant="secondary" className="px-2.5 py-1 text-xs">
                    Roll back
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
