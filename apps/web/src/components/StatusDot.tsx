import type { DeploymentStatus } from "@vibeyeeter/types";

const DOT_COLOR: Record<DeploymentStatus, string> = {
  succeeded: "bg-emerald-500",
  running: "bg-amber-400",
  pending: "bg-amber-400",
  failed: "bg-red-500",
  rolled_back: "bg-slate-400",
};

const PULSE_STATUSES = new Set<DeploymentStatus>(["running", "pending"]);

export function StatusDot({ status }: { status: DeploymentStatus }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {PULSE_STATUSES.has(status) && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT_COLOR[status]}`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT_COLOR[status]}`} />
    </span>
  );
}
