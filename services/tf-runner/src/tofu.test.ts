import { EventEmitter } from "node:events";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createFakeChild } from "./test-utils/fake-spawn.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const { spawn } = await import("node:child_process");
const { runTofuCommand, parseChangeSummary, varsToArgs, isTofuAvailable } = await import("./tofu.js");

const spawnMock = vi.mocked(spawn);

afterEach(() => {
  spawnMock.mockReset();
});

describe("parseChangeSummary", () => {
  it("extracts add/change/remove counts from a change_summary line", () => {
    const output = [
      '{"@level":"info","type":"resource_drift"}',
      '{"@level":"info","type":"change_summary","changes":{"add":1,"change":2,"remove":3,"operation":"plan"}}',
    ].join("\n");

    expect(parseChangeSummary(output)).toEqual({ toAdd: 1, toChange: 2, toDestroy: 3 });
  });

  it("returns undefined when there is no change_summary line", () => {
    expect(parseChangeSummary('{"type":"resource_drift"}\nnot json at all')).toBeUndefined();
  });

  it("ignores non-JSON lines without throwing", () => {
    const output = ['Initializing the backend...', '{"type":"change_summary","changes":{"add":0,"change":0,"remove":0}}'].join(
      "\n",
    );
    expect(parseChangeSummary(output)).toEqual({ toAdd: 0, toChange: 0, toDestroy: 0 });
  });
});

describe("varsToArgs", () => {
  it("returns an empty array for undefined vars", () => {
    expect(varsToArgs(undefined)).toEqual([]);
  });

  it("formats each entry as -var=key=value", () => {
    expect(varsToArgs({ region: "us-east-1", env: "prod" })).toEqual([
      "-var=region=us-east-1",
      "-var=env=prod",
    ]);
  });
});

describe("runTofuCommand", () => {
  it("resolves with combined stdout/stderr and the exit code", async () => {
    spawnMock.mockReturnValue(
      createFakeChild({ stdout: "hello\n", stderr: "warn\n", exitCode: 0 }) as never,
    );

    const result = await runTofuCommand("/tmp/whatever", ["init"]);

    expect(result).toEqual({ exitCode: 0, stdout: "hello\n", stderr: "warn\n" });
  });

  it("resolves with a non-zero exit code on failure rather than rejecting", async () => {
    spawnMock.mockReturnValue(createFakeChild({ stdout: "", stderr: "boom", exitCode: 1 }) as never);

    const result = await runTofuCommand("/tmp/whatever", ["plan"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("boom");
  });
});

describe("isTofuAvailable", () => {
  it("returns true when the binary responds successfully", async () => {
    spawnMock.mockReturnValue(createFakeChild({ exitCode: 0 }) as never);
    await expect(isTofuAvailable()).resolves.toBe(true);
  });

  it("returns false when the binary is missing (ENOENT)", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        const error = new Error("spawn tofu ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        child.emit("error", error);
      });
      return child as never;
    });

    await expect(isTofuAvailable()).resolves.toBe(false);
  });
});
