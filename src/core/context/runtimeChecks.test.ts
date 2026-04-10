// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildRuntimeSignalsText, detectRuntimeSignals } from "./runtimeChecks";

describe("runtimeChecks", () => {
  it("detects node async hazards and go concurrency/error signals", async () => {
    const signals = await detectRuntimeSignals([
      {
        filename: "src/task.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        changes: 5,
        patch: null,
        blobUrl: null,
        fullContent: `
          export async function run(items) {
            for (const item of items) {
              await fetch(item.url);
            }
          }
        `,
      },
      {
        filename: "worker.go",
        status: "modified",
        additions: 4,
        deletions: 0,
        changes: 4,
        patch: null,
        blobUrl: null,
        fullContent: `
          package worker

          func Run() {
            go process()
            value, err := doWork()
            _ = value
          }
        `,
      },
    ]);

    expect(signals.some((signal) => signal.kind === "async-in-loop")).toBe(true);
    expect(signals.some((signal) => signal.kind === "goroutine-without-sync")).toBe(true);
    expect(signals.some((signal) => signal.kind === "ignored-errors")).toBe(true);
    expect(buildRuntimeSignalsText(signals)).toContain("runtime");
  });
});
