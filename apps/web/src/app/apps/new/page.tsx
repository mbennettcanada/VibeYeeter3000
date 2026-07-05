import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export default function NewAppPage() {
  return (
    <>
      <PageHeader
        title="Register application"
        breadcrumb={
          <Link href="/" className="hover:text-slate-700">
            Dashboard
          </Link>
        }
      />
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-500">
          The app registration flow (repo provisioning, namespace, and Terraform bootstrap) isn&apos;t
          built yet.
        </p>
      </div>
    </>
  );
}
