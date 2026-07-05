import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { AppNav } from "@/components/AppNav";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/Button";
import { StatusDot } from "@/components/StatusDot";
import { DeploymentsTable } from "@/components/DeploymentsTable";
import { getMockApp, getMockDeployments, getMockSecrets } from "@/lib/mock-data";
import { timeAgo, truncateTag } from "@/lib/format";

export default function AppOverviewPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }

  const deployments = getMockDeployments(app.id);
  const latestDeployment = deployments[0];
  const secrets = getMockSecrets(app.id);
  const migrationsApplied = 12;

  return (
    <>
      <PageHeader
        title={app.name}
        breadcrumb={
          <>
            <Link href="/" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-700">{app.name}</span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/apps/${app.id}/logs`}>
              <Button variant="secondary">View logs</Button>
            </Link>
            <Button variant="secondary" disabled title="Not implemented yet">
              Force redeploy
            </Button>
            <Link href={`/apps/${app.id}/deployments`}>
              <Button variant="primary">Roll back</Button>
            </Link>
          </div>
        }
      />
      <AppNav appId={app.id} />

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <StatusDot status={app.latestDeploymentStatus} />
          <span className="text-sm font-medium text-slate-700">
            {app.podsRunning} / {app.podsDesired} pods running
          </span>
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <span className="text-sm text-slate-500">
          Image <span className="font-mono text-slate-700">{truncateTag(latestDeployment?.imageTag ?? "—")}</span>
        </span>
        <div className="h-4 w-px bg-slate-200" />
        <span className="text-sm text-slate-500">
          Last deployed <span className="text-slate-700">{timeAgo(app.updatedAt)}</span>
        </span>
        <div className="h-4 w-px bg-slate-200" />
        <a
          href={`https://${app.subdomain}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-indigo-600 hover:text-indigo-500 hover:underline"
        >
          {app.subdomain}
        </a>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pods running" value={`${app.podsRunning}/${app.podsDesired}`} />
        <StatCard label="Deployments" value={deployments.length} />
        <StatCard label="Migrations applied" value={migrationsApplied} />
        <StatCard label="Secrets" value={secrets.length} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Recent deployments</h2>
        <Link
          href={`/apps/${app.id}/deployments`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View all
        </Link>
      </div>
      <DeploymentsTable deployments={deployments.slice(0, 5)} />
    </>
  );
}
