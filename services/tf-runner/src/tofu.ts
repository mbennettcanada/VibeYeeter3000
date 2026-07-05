import { spawn } from "node:child_process";
import { config } from "./config.js";

export interface TofuCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Uses spawn (not exec) so stdout/stderr arrive as a stream of chunks rather
// than being buffered until the process exits — callers that want to
// forward progress in real time can read child.stdout/child.stderr directly
// via runTofuCommandStreaming below; this wrapper just accumulates both for
// callers that only care about the final combined output.
export function runTofuCommand(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<TofuCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tofuBin, args, {
      cwd,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export interface ChangeSummary {
  toAdd: number;
  toChange: number;
  toDestroy: number;
}

interface TofuJsonLine {
  type?: string;
  changes?: {
    add?: number;
    change?: number;
    remove?: number;
  };
}

// `tofu plan -json` / `tofu apply -json` emit one JSON object per line. The
// summary line has type "change_summary" — everything else (refresh
// progress, resource drift, etc.) is ignored here.
export function parseChangeSummary(jsonOutput: string): ChangeSummary | undefined {
  for (const line of jsonOutput.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let parsed: TofuJsonLine;
    try {
      parsed = JSON.parse(line) as TofuJsonLine;
    } catch {
      continue;
    }
    if (parsed.type === "change_summary" && parsed.changes) {
      return {
        toAdd: parsed.changes.add ?? 0,
        toChange: parsed.changes.change ?? 0,
        toDestroy: parsed.changes.remove ?? 0,
      };
    }
  }
  return undefined;
}

export function varsToArgs(vars: Record<string, string> | undefined): string[] {
  if (!vars) {
    return [];
  }
  return Object.entries(vars).flatMap(([key, value]) => [`-var=${key}=${value}`]);
}

export async function isTofuAvailable(): Promise<boolean> {
  try {
    const result = await runTofuCommand(process.cwd(), ["-version"]);
    return result.exitCode === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
