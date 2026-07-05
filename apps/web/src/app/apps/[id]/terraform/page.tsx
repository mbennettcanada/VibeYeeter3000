import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { TypeBadge } from "@/components/TypeBadge";
import { PlanDiff } from "@/components/PlanDiff";
import { getMockApp, getMockTerraformRuns, mockPlanDiff } from "@/lib/mock-data";
import { formatDuration, timeAgo } from "@/lib/format";

export default function TerraformPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }

  const runs = getMockTerraformRuns(app.id);

  return (
    <>
      <PageHeader
        title="Terraform"
        breadcrumb={
          <>
            <Link href="/" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <Link href={`/apps/${app.id}`} className="hover:text-slate-700">
              {app.name}
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-700">Terraform</span>
          </>
        }
      />

      <div className="mb-8 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Latest plan</h2>
            <p className="text-xs text-slate-500">Generated {timeAgo(runs[0]?.createdAt ?? new Date().toISOString())}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              <span className="font-medium text-emerald-600">1 to add</span> ·{" "}
              <span className="font-medium text-amber-600">2 to change</span> ·{" "}
              <span className="font-medium text-red-600">1 to destroy</span>
            </span>
            <Button variant="primary" disabled title="Requires review workflow (not implemented yet)">
              Approve &amp; Apply
            </Button>
          </div>
        </div>
        <div className="p-4">
          <PlanDiff diff={mockPlanDiff} />
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Run history</h2>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Type
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-slate-50/75">
                <td className="whitespace-nowrap px-4 py-3">
                  <TypeBadge type={run.type} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                  {run.triggeredBy}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                  {formatDuration(run.duration)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                  {timeAgo(run.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
