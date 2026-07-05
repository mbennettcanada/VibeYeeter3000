"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { TerraformRunStatus } from "@vibeyeeter/types";
import { PageHeader } from "@/components/PageHeader";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { TypeBadge } from "@/components/TypeBadge";
import { PlanDiff } from "@/components/PlanDiff";
import { TerminalOutput } from "@/components/TerminalOutput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/Toast";
import {
  getMockApp,
  getMockTerraformRuns,
  mockApplyLogScript,
  mockPlanDiff,
  type MockTerraformRun,
} from "@/lib/mock-data";
import { formatDuration, timeAgo } from "@/lib/format";

export default function TerraformPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }
  const appId = app.id;

  const [runs, setRuns] = useState<MockTerraformRun[]>(() => getMockTerraformRuns(appId));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyStatus, setApplyStatus] = useState<TerraformRunStatus | null>(null);
  const [applyOutput, setApplyOutput] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(
    () => () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    },
    [],
  );

  function startApply() {
    setConfirmOpen(false);
    const runId = `tf_${appId}_${Date.now()}`;
    const newRun: MockTerraformRun = {
      id: runId,
      appId,
      type: "apply",
      status: "running",
      planDiff: null,
      triggeredBy: "dev@local",
      duration: null,
      createdAt: new Date().toISOString(),
    };
    setRuns((prev) => [newRun, ...prev]);
    setApplyStatus("running");
    setApplyOutput([]);

    let lineIndex = 0;
    let poll = 0;
    const startedAt = Date.now();

    // Simulates polling GET /tf-runner/runs/:runId every 3s until terminal.
    pollRef.current = setInterval(() => {
      poll += 1;
      if (lineIndex < mockApplyLogScript.length) {
        setApplyOutput((prev) => [...prev, mockApplyLogScript[lineIndex] as string]);
        lineIndex += 1;
      }

      if (poll >= 3) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
        const finalStatus: TerraformRunStatus = "succeeded";
        const duration = Math.round((Date.now() - startedAt) / 1000);
        setApplyStatus(finalStatus);
        setRuns((prev) =>
          prev.map((run) => (run.id === runId ? { ...run, status: finalStatus, duration } : run)),
        );
        pushToast(
          finalStatus === "succeeded" ? "success" : "error",
          finalStatus === "succeeded" ? "Apply succeeded" : "Apply failed",
        );
      }
    }, 3000);
  }

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
      <AppNav appId={app.id} />

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
            <Button
              variant="primary"
              onClick={() => setConfirmOpen(true)}
              disabled={applyStatus === "running"}
            >
              Approve &amp; Apply
            </Button>
          </div>
        </div>
        <div className="p-4">
          <PlanDiff diff={mockPlanDiff} />
        </div>
      </div>

      {applyStatus && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Apply output</h2>
            <StatusBadge status={applyStatus} />
          </div>
          <div className="p-4">
            <TerminalOutput lines={applyOutput} />
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmOpen}
        title="Approve & apply plan"
        description="This runs `tofu apply` against the latest plan and provisions real infrastructure changes."
        confirmLabel="Approve & Apply"
        onConfirm={startApply}
        onCancel={() => setConfirmOpen(false)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
