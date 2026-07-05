import os from "node:os";
import path from "node:path";
import { cp, mkdir } from "node:fs/promises";

export function runDirFor(runId: string): string {
  return path.join(os.tmpdir(), "tf-runs", runId);
}

// Copies the OpenTofu source into an isolated per-run directory so
// concurrent runs (and repeated runs against the same app) never share
// state or a plan file with each other.
export async function prepareRunDir(runId: string, sourceDir: string): Promise<string> {
  const dir = runDirFor(runId);
  await mkdir(dir, { recursive: true });
  await cp(sourceDir, dir, { recursive: true });
  return dir;
}
