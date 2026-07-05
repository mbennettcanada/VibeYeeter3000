function lineClass(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("+")) {
    return "text-emerald-400";
  }
  if (trimmed.startsWith("~")) {
    return "text-amber-400";
  }
  if (trimmed.startsWith("-")) {
    return "text-red-400";
  }
  if (trimmed.startsWith("#")) {
    return "text-slate-400";
  }
  if (trimmed.startsWith("Plan:")) {
    return "text-white font-semibold";
  }
  return "text-slate-300";
}

export function PlanDiff({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <div className="overflow-x-auto rounded-lg bg-[#0b0f19] p-4 font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre ${lineClass(line)}`}>
          {line || " "}
        </div>
      ))}
    </div>
  );
}
