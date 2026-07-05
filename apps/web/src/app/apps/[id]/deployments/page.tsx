import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DeploymentsTable } from "@/components/DeploymentsTable";
import { getMockApp, getMockDeployments } from "@/lib/mock-data";

export default function DeploymentsPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }

  const deployments = getMockDeployments(app.id);

  return (
    <>
      <PageHeader
        title="Deployments"
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
            <span className="text-slate-700">Deployments</span>
          </>
        }
      />
      <DeploymentsTable deployments={deployments} showActions />
    </>
  );
}
