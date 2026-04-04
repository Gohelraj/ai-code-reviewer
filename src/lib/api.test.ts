import { describe, expect, it } from "vitest";
import type { FileDiff } from "../types";
import {
  buildContextAwareDiff,
  buildDiffContent,
  parseGitHubIssueUrl,
  parseGitHubUrl,
  parseGitLabIssueUrl,
  parseGitLabUrl,
} from "./api";

const files: FileDiff[] = [
  {
    filename: "src/app.ts",
    status: "modified",
    additions: 4,
    deletions: 2,
    changes: 6,
    patch: "@@ -1,2 +1,4 @@\n-const value = 1;\n+const value = 2;",
    blobUrl: null,
    fullContent: "const value = 2;\nexport default value;",
  },
];

describe("api helpers", () => {
  it("parses repository and issue urls", () => {
    expect(parseGitHubUrl("https://github.com/acme/repo/pull/42")).toEqual({
      owner: "acme",
      repo: "repo",
      prNumber: "42",
    });
    expect(parseGitLabUrl("https://gitlab.com/acme/team/repo/-/merge_requests/12")).toEqual({
      projectPath: "acme/team/repo",
      mrIid: "12",
    });
    expect(parseGitHubIssueUrl("https://github.com/acme/repo/issues/7")).toEqual({
      owner: "acme",
      repo: "repo",
      number: "7",
    });
    expect(parseGitLabIssueUrl("https://gitlab.com/acme/team/repo/-/issues/8")).toEqual({
      projectPath: "acme/team/repo",
      issueIid: "8",
    });
  });

  it("builds diff-only and context-aware review payloads", () => {
    const diffOnly = buildDiffContent(files);
    const withContext = buildContextAwareDiff(files);

    expect(diffOnly).toContain("### src/app.ts [modified] +4/-2");
    expect(diffOnly).toContain("@@ -1,2 +1,4 @@");
    expect(withContext).toContain("FULL FILE (current state after changes)");
    expect(withContext).toContain("DIFF (what changed)");
    expect(withContext).toContain("export default value;");
  });
});
