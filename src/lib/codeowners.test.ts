import { describe, expect, it } from "vitest";
import type { FileDiff } from "../types";
import { buildReviewerSuggestions, getCodeownersForFile, parseCodeowners } from "./codeowners";

const files: FileDiff[] = [
  {
    filename: "src/auth/login.ts",
    status: "modified",
    additions: 10,
    deletions: 2,
    changes: 12,
    patch: null,
    blobUrl: null,
    fullContent: null,
  },
  {
    filename: "src/ui/Button.tsx",
    status: "modified",
    additions: 5,
    deletions: 1,
    changes: 6,
    patch: null,
    blobUrl: null,
    fullContent: null,
  },
];

describe("codeowners", () => {
  it("parses rules and applies the last matching rule", () => {
    const rules = parseCodeowners(`
      * @frontend
      src/auth/** @security @backend
      src/ui/** @design
    `);

    expect(getCodeownersForFile("src/auth/login.ts", rules)).toEqual(["@security", "@backend"]);
    expect(getCodeownersForFile("src/ui/Button.tsx", rules)).toEqual(["@design"]);
  });

  it("builds reviewer suggestions from changed files", () => {
    const rules = parseCodeowners(`
      * @frontend
      src/auth/** @security @backend
      src/ui/** @design
    `);

    expect(buildReviewerSuggestions(files, rules)).toEqual([
      { reviewer: "@backend", files: ["src/auth/login.ts"] },
      { reviewer: "@design", files: ["src/ui/Button.tsx"] },
      { reviewer: "@security", files: ["src/auth/login.ts"] },
    ]);
  });
});
