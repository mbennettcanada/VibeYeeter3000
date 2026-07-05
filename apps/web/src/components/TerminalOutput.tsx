export function TerminalOutput({ lines }: { lines: string[] }) {
  return (
    <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg bg-[#0b0f19] p-4 font-mono text-xs leading-relaxed text-slate-300">
      {lines.length === 0 ? (
        <div className="text-slate-500">No output yet.</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line || " "}
          </div>
        ))
      )}
    </div>
  );
}
