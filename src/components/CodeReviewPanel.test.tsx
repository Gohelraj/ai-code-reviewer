import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CodeReviewPanel } from "./CodeReviewPanel";
import type { AIConfig } from "./AISettings";
import type { CodeReview, MRData } from "../types";

const aiConfig: AIConfig = {
  provider: "openrouter",
  apiKey: "sk-test",
  model: "anthropic/claude-sonnet-4-6",
  customRules: "",
  postingMode: "inline",
  presets: [],
  lastPresetId: "",
};

const mrData: MRData = {
  platform: "github",
  pr: {
    title: "Protect auth flows",
    description: "Adds auth checks.",
    baseBranch: "main",
    headBranch: "feature/auth",
    author: "alice",
    state: "open",
    additions: 25,
    deletions: 8,
    changedFiles: 2,
    commits: 1,
    createdAt: "2026-03-31T10:00:00Z",
    url: "https://github.com/acme/repo/pull/42",
  },
  files: [
    {
      filename: "src/auth.ts",
      status: "modified",
      additions: 25,
      deletions: 8,
      changes: 33,
      patch: "@@ -1,2 +1,2 @@\n-old\n+new",
      blobUrl: null,
      fullContent: "export function auth() {}",
    },
  ],
};

const review: CodeReview = {
  overallVerdict: "request_changes",
  overallScore: 6.8,
  executiveSummary: "Auth coverage is incomplete.",
  strengths: ["The refactor keeps the auth code centralized."],
  issues: [
    {
      id: "issue-1",
      severity: "critical",
      category: "Security",
      title: "Missing route guard",
      description: "The route can be hit without auth.",
      confidence: "high",
      rationale: "Auth checks are missing on a public entry point.",
      file: "src/auth.ts",
      lineHint: "Line 12",
      currentCode: "return handler(req);",
      suggestedFix: "if (!req.user) throw new Error('Unauthorized');",
      impact: "Sensitive data can be exposed.",
      fixable: true,
    },
  ],
  architectureObservations: [],
  securityConsiderations: ["Public routes still need a guard."],
  performanceConsiderations: ["No meaningful performance regression expected."],
  testingAssessment: "Auth coverage should include denial cases.",
  testGapSummary: "Production code changed but no test files were modified. Reviewers should verify whether test coverage is missing or intentionally unchanged.",
  riskHotspots: [
    {
      file: "src/auth.ts",
      score: 82,
      reasons: ["Touches auth or permission-sensitive code", "Production change without accompanying test updates"],
    },
  ],
  reviewerSuggestions: [
    {
      reviewer: "@security-team",
      files: ["src/auth.ts"],
    },
  ],
  reviewDiff: {
    addedIssueIds: ["issue-1"],
    removedIssueIds: [],
    changedSeverityIds: [],
    scoreDelta: 0.8,
  },
  mergeReadiness: "Hold the merge until the auth guard and tests land.",
};

describe("CodeReviewPanel", () => {
  it("renders trust signals, hotspots, and reviewer routing", async () => {
    const user = userEvent.setup();
    const onSelectedFileChange = vi.fn();

    render(
      <CodeReviewPanel
        review={review}
        previousReview={{ ...review, overallScore: 6, reviewDiff: undefined }}
        previousReviewMeta={{ source: "history", previousCommits: 1, commitDelta: 2, timestamp: new Date("2026-03-30T10:00:00Z").getTime() }}
        mrData={mrData}
        aiConfig={aiConfig}
        selectedIssueId="issue-1"
        reviewChat={[{ role: "assistant", content: "Check the auth layer first.", createdAt: 1 }]}
        onSelectedFileChange={onSelectedFileChange}
        requirementsCheck={{
          issueTitle: "Auth coverage",
          issueSummary: "Protect every route",
          overallCoverage: "partially_covered",
          coverageScore: 55,
          requirements: [],
          missingItems: [],
          suggestions: [],
        }}
        mrDescriptionReview={{
          currentQuality: "needs_improvement",
          qualityScore: 62,
          strengths: [],
          suggestions: [],
          suggestedDescription: "Add testing details.",
        }}
      />,
    );

    expect(await screen.findByText("HIGH CONF")).toBeInTheDocument();
    expect(screen.getByText("Auth checks are missing on a public entry point.")).toBeInTheDocument();
    expect(screen.getByText("Test Gap Signal")).toBeInTheDocument();
    expect(screen.getByText("Risk Hotspots")).toBeInTheDocument();
    expect(screen.getByText("Suggested Reviewers")).toBeInTheDocument();
    expect(screen.getByText("Merge Readiness Gates")).toBeInTheDocument();
    expect(screen.getByText("Requirements coverage")).toBeInTheDocument();
    expect(screen.getByText("AI reviewer")).toBeInTheDocument();
    expect(screen.getByText("Comparison vs Last Saved Review")).toBeInTheDocument();
    expect(screen.getByText(/2 new commits detected since the last saved review/i)).toBeInTheDocument();

    const hotspotsSection = screen.getByText("Risk Hotspots").closest("div");
    const hotspotButton = within(hotspotsSection as HTMLElement).getByRole("button", { name: /risk 82/i });
    await user.click(hotspotButton);
    expect(onSelectedFileChange).toHaveBeenCalledWith("src/auth.ts");
  });
});
