import type { TerraformRunType } from "@vibeyeeter/types";

const STYLES: Record<TerraformRunType, string> = {
  plan: "bg-slate-100 text-slate-700 ring-slate-500/20",
  apply: "bg-violet-50 text-violet-700 ring-violet-600/20",
  destroy: "bg-red-50 text-red-700 ring-red-600/20",
};

export function TypeBadge({ type }: { type: TerraformRunType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[type]}`}
    >
      {type}
    </span>
  );
}
