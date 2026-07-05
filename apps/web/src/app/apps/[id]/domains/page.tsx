import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { AppNav } from "@/components/AppNav";
import { DomainsManager } from "@/components/DomainsManager";
import { getMockApp } from "@/lib/mock-data";

export default function AppDomainsPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title="Domains"
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
            <span className="text-slate-700">Domains</span>
          </>
        }
      />
      <AppNav appId={app.id} />
      <DomainsManager appId={app.id} />
    </>
  );
}
