import type { DeploymentStatus, TerraformRunStatus } from "@vibeyeeter/types";

type Status = DeploymentStatus | TerraformRunStatus;

const STYLES: Record<Status, string> = {
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  running: "bg-blue-50 text-blue-700 ring-blue-600/20",
  pending: "bg-slate-100 text-slate-600 ring-slate-500/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  rolled_back: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const LABELS: Record<Status, string> = {
  succeeded: "Succeeded",
  running: "Running",
  pending: "Pending",
  failed: "Failed",
  rolled_back: "Rolled back",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {status === "running" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
      )}
      {LABELS[status]}
    </span>
  );
}
