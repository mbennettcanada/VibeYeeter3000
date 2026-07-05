import { EventEmitter } from "node:events";

export interface FakeChildResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

// Minimal stand-in for the ChildProcess returned by node:child_process's
// spawn — just enough surface (stdout/stderr event emitters + close event)
// for tofu.ts's runTofuCommand to consume.
export function createFakeChild({ stdout = "", stderr = "", exitCode = 0 }: FakeChildResult) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  queueMicrotask(() => {
    if (stdout) {
      child.stdout.emit("data", Buffer.from(stdout));
    }
    if (stderr) {
      child.stderr.emit("data", Buffer.from(stderr));
    }
    child.emit("close", exitCode);
  });

  return child;
}
