import { describe, expect, it } from "vitest";
import type { CodeReview, FileDiff } from "../types";
import {
  buildMergeReadinessGates,
  computeReviewDiff,
  computeRiskHotspots,
  computeTestGapSummary,
  getRepoKeyFromUrl,
  readUiStateFromLocation,
  writeUiStateToLocation,
} from "./review-utils";

const baseFiles: FileDiff[] = [
  {
    filename: "src/auth/login.ts",
    status: "modified",
    additions: 30,
    deletions: 10,
    changes: 40,
    patch: "@@ -1,2 +1,2 @@\n-old\n+new",
    blobUrl: null,
    fullContent: null,
  },
  {
    filename: "src/auth/login.test.ts",
    status: "modified",
    additions: 4,
    deletions: 1,
    changes: 5,
    patch: "@@ -1,2 +1,2 @@\n-old\n+new",
    blobUrl: null,
    fullContent: null,
  },
];

function buildReview(overrides: Partial<CodeReview> = {}): CodeReview {
  return {
    overallVerdict: "request_changes",
    overallScore: 6.5,
    executiveSummary: "Needs work.",
    strengths: ["Clear structure"],
    issues: [
      {
        id: "issue-1",
        severity: "critical",
        category: "Security",
        title: "Missing auth guard",
        description: "This route is not protected.",
        confidence: "high",
        rationale: "The entry point is public and handles sensitive data.",
        file: "src/auth/login.ts",
        lineHint: "Line 12",
        currentCode: "login();",
        suggestedFix: "requireAuth();\nlogin();",
        impact: "Unauthenticated access is possible.",
        fixable: true,
      },
    ],
    architectureObservations: [],
    securityConsiderations: [],
    performanceConsiderations: [],
    testingAssessment: "Tests should be expanded.",
    testGapSummary: "Production code changed but no test files were modified. Reviewers should verify whether test coverage is missing or intentionally unchanged.",
    riskHotspots: [],
    reviewerSuggestions: [],
    mergeReadiness: "Do not merge yet.",
    ...overrides,
  };
}

describe("review-utils", () => {
  it("computes test gap summaries for different file mixes", () => {
    expect(computeTestGapSummary(baseFiles)).toContain("related test files were updated");
    expect(computeTestGapSummary([baseFiles[0]])).toContain("no test files were modified");
    expect(computeTestGapSummary([{
      ...baseFiles[1],
      filename: "README.md",
      status: "modified",
    }])).toContain("No production-code changes detected");
  });

  it("tracks severity changes separately from added and removed issues", () => {
    const previous = buildReview({
      overallScore: 5.5,
      issues: [
        {
          ...buildReview().issues[0],
          id: "prev-issue",
          severity: "warning",
        },
      ],
    });
    const current = buildReview({
      overallScore: 7,
      issues: [
        {
          ...buildReview().issues[0],
          id: "curr-issue",
          severity: "critical",
        },
      ],
    });

    expect(computeReviewDiff(previous, current)).toEqual({
      addedIssueIds: [],
      removedIssueIds: [],
      changedSeverityIds: ["curr-issue"],
      scoreDelta: 1.5,
    });
  });

  it("scores risk hotspots from file patterns, findings, and missing tests", () => {
    const hotspots = computeRiskHotspots(
      [
        {
          ...baseFiles[0],
          changes: 140,
        },
        {
          ...baseFiles[1],
          filename: "infra/docker-compose.yml",
          status: "modified",
          additions: 8,
          deletions: 2,
          changes: 10,
          patch: "+FOO=bar",
        },
      ],
      buildReview().issues,
      buildReview().testGapSummary,
    );

    expect(hotspots[0]?.file).toBe("src/auth/login.ts");
    expect(hotspots[0]?.reasons.join(" ")).toContain("Touches auth");
    expect(hotspots[0]?.reasons.join(" ")).toContain("Production change without accompanying test updates");
    expect(hotspots.some((item) => item.file === "infra/docker-compose.yml")).toBe(true);
  });

  it("builds merge readiness gates with requirements and description signals", () => {
    const gates = buildMergeReadinessGates({
      review: buildReview(),
      requirementsCheck: {
        issueTitle: "Auth hardening",
        issueSummary: "Protect routes",
        overallCoverage: "partially_covered",
        coverageScore: 55,
        requirements: [],
        missingItems: [],
        suggestions: [],
      },
      mrDescriptionReview: {
        currentQuality: "needs_improvement",
        qualityScore: 62,
        strengths: [],
        suggestions: [],
        suggestedDescription: "Improved description",
      },
    });

    expect(gates.find((gate) => gate.label === "Critical issues")?.status).toBe("fail");
    expect(gates.find((gate) => gate.label === "Requirements coverage")?.status).toBe("fail");
    expect(gates.find((gate) => gate.label === "MR description quality")?.status).toBe("warn");
  });

  it("reads and writes deep-link UI state in the location", () => {
    window.history.replaceState({}, "", "/?tab=review&file=src/auth/login.ts&issue=issue-1");
    expect(readUiStateFromLocation()).toEqual({
      activeTab: "review",
      selectedFile: "src/auth/login.ts",
      selectedIssueId: "issue-1",
    });

    writeUiStateToLocation({
      activeTab: "summary",
      selectedFile: "src/app.ts",
      selectedIssueId: null,
    });

    const params = new URL(window.location.href).searchParams;
    expect(params.get("tab")).toBe("summary");
    expect(params.get("file")).toBe("src/app.ts");
    expect(params.get("issue")).toBeNull();
  });

  it("derives stable repo keys from GitHub and GitLab urls", () => {
    expect(getRepoKeyFromUrl("https://github.com/acme/merge-ai/pull/42")).toBe("github:acme/merge-ai");
    expect(getRepoKeyFromUrl("https://gitlab.com/acme/platform/api/-/merge_requests/91")).toBe("gitlab:acme/platform/api");
    expect(getRepoKeyFromUrl("not-a-url")).toBeNull();
  });
});
