"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Deployment } from "@vibeyeeter/types";
import { PageHeader } from "@/components/PageHeader";
import { AppNav } from "@/components/AppNav";
import { DeploymentsTable } from "@/components/DeploymentsTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/Toast";
import { getMockApp, getMockDeployments } from "@/lib/mock-data";
import { listDeployments, rollbackDeployment } from "@/lib/api";
import { truncateTag } from "@/lib/format";

export default function DeploymentsPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }
  const appId = app.id;

  const [deployments, setDeployments] = useState<Deployment[]>(() => getMockDeployments(appId));
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Deployment | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();

  async function refresh() {
    try {
      const res = await listDeployments(appId);
      setDeployments(res.deployments);
    } catch {
      setDeployments(getMockDeployments(appId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function handleConfirmRollback() {
    if (!target) {
      return;
    }
    setRollingBack(true);
    try {
      await rollbackDeployment(appId, target.id);
      pushToast("success", `Rolled back to ${truncateTag(target.imageTag)}`);
      setTarget(null);
      await refresh();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  }

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
      <AppNav appId={app.id} />

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Loading deployments…
        </div>
      ) : (
        <DeploymentsTable
          deployments={deployments}
          showActions
          onRollback={setTarget}
          rollingBackId={rollingBack ? target?.id : null}
        />
      )}

      <ConfirmDialog
        open={target !== null}
        title="Roll back deployment"
        description={
          <>
            Roll back to image <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{target ? truncateTag(target.imageTag) : ""}</code>?
          </>
        }
        confirmLabel="Roll back"
        danger
        loading={rollingBack}
        onConfirm={handleConfirmRollback}
        onCancel={() => setTarget(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
