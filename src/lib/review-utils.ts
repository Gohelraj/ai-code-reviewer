import type { CodeReview, MRDescriptionReview, RequirementsCheck, ReviewIssue, FileDiff } from "../types";
import type { ReviewMode } from "../components/AISettings";

export interface MergeReadinessGate {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

const TEST_FILE_PATTERN = /(^|\/)(tests?|__tests__|__mocks__|specs?)(\/|$)|(\.|-)(test|spec)\.[^.]+$/i;
const AUTH_RISK_PATTERN = /(auth|permission|role|session|token|oauth|acl|rbac|login|signup|policy|guard)/i;
const CONFIG_RISK_PATTERN = /(config|env|settings|docker|compose|k8s|terraform|helm|workflow|pipeline|secret)/i;
const REVIEW_MODE_CONFIG = {
  quick: {
    maxFiles: 8,
    maxFullFiles: 0,
    totalContextChars: 40_000,
    perFilePatchChars: 3_000,
    perFileFullChars: 0,
  },
  deep: {
    maxFiles: 20,
    maxFullFiles: Infinity,
    totalContextChars: 120_000,
    perFilePatchChars: 6_000,
    perFileFullChars: 15_000,
  },
} as const;

export interface ReviewContextPlan {
  selectedFiles: string[];
  fullContentFiles: string[];
  omittedCount: number;
  totalContextChars: number;
  perFilePatchChars: number;
  perFileFullChars: number;
}

export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERN.test(filename);
}

export function isProductionCodeFile(filename: string): boolean {
  if (isTestFile(filename)) return false;
  return /\.(ts|tsx|js|jsx|py|rb|go|java|kt|rs|php|cs|swift|c|cpp|m|mm|vue|svelte)$/i.test(filename);
}

function estimateFileReviewScore(file: FileDiff): number {
  let score = Math.min(file.changes, 140);
  if (isProductionCodeFile(file.filename)) {
    score += 18;
  }
  if (AUTH_RISK_PATTERN.test(file.filename)) {
    score += 24;
  }
  if (CONFIG_RISK_PATTERN.test(file.filename)) {
    score += 16;
  }
  if (isTestFile(file.filename)) {
    score -= 10;
  }
  if (file.status === "added") {
    score += 8;
  }
  if (!file.patch) {
    score -= 6;
  }
  return score;
}

export function getReviewContextPlan(files: FileDiff[], reviewMode: ReviewMode = "deep"): ReviewContextPlan {
  const config = REVIEW_MODE_CONFIG[reviewMode];
  const eligibleFiles = files
    .filter((file) => file.status !== "removed" && !!file.patch)
    .sort((left, right) => estimateFileReviewScore(right) - estimateFileReviewScore(left));

  const selected = eligibleFiles.slice(0, config.maxFiles);
  const fullContentFiles = selected
    .filter((file) => isProductionCodeFile(file.filename))
    .slice(0, config.maxFullFiles)
    .map((file) => file.filename);

  return {
    selectedFiles: selected.map((file) => file.filename),
    fullContentFiles,
    omittedCount: Math.max(files.filter((file) => file.status !== "removed").length - selected.length, 0),
    totalContextChars: config.totalContextChars,
    perFilePatchChars: config.perFilePatchChars,
    perFileFullChars: config.perFileFullChars,
  };
}

function estimateFullContentChars(file: FileDiff, perFileFullChars: number): number {
  if (file.fullContent) {
    return Math.min(file.fullContent.length, perFileFullChars);
  }
  const patchLength = file.patch?.length ?? 0;
  const heuristic = Math.max(file.changes * 140, patchLength * 3, 1_200);
  return Math.min(heuristic, perFileFullChars);
}

export function estimateReviewContextChars(files: FileDiff[], reviewMode: ReviewMode = "deep"): number {
  const plan = getReviewContextPlan(files, reviewMode);
  let total = 0;

  for (const filename of plan.selectedFiles) {
    const file = files.find((entry) => entry.filename === filename);
    if (!file) continue;
    total += Math.min(file.patch?.length ?? 120, plan.perFilePatchChars) + 64;
    if (plan.fullContentFiles.includes(filename) && plan.perFileFullChars > 0) {
      total += estimateFullContentChars(file, plan.perFileFullChars) + 64;
    }
  }

  if (plan.omittedCount > 0) {
    total += 120;
  }

  return Math.min(total, plan.totalContextChars);
}

export function computeTestGapSummary(files: FileDiff[]): string {
  const hasProductionChanges = files.some((file) => isProductionCodeFile(file.filename) && file.status !== "removed");
  const hasTestChanges = files.some((file) => isTestFile(file.filename) && file.status !== "removed");

  if (!hasProductionChanges) {
    return "No production-code changes detected, so dedicated test updates are not required for this MR.";
  }

  if (hasTestChanges) {
    return "Production code changed and related test files were updated in the same MR.";
  }

  return "Production code changed but no test files were modified. Reviewers should verify whether test coverage is missing or intentionally unchanged.";
}

export function createIssueFingerprint(issue: ReviewIssue): string {
  return [
    issue.file ?? "",
    issue.lineHint ?? "",
    issue.category,
    issue.title.trim().toLowerCase(),
  ].join("|");
}

export function computeReviewDiff(previous: CodeReview | null | undefined, current: CodeReview): CodeReview["reviewDiff"] {
  if (!previous) {
    return {
      addedIssueIds: current.issues.map((issue) => issue.id),
      removedIssueIds: [],
      changedSeverityIds: [],
      scoreDelta: current.overallScore,
    };
  }

  const previousByFingerprint = new Map(previous.issues.map((issue) => [createIssueFingerprint(issue), issue]));
  const currentByFingerprint = new Map(current.issues.map((issue) => [createIssueFingerprint(issue), issue]));

  const addedIssueIds = current.issues
    .filter((issue) => !previousByFingerprint.has(createIssueFingerprint(issue)))
    .map((issue) => issue.id);

  const removedIssueIds = previous.issues
    .filter((issue) => !currentByFingerprint.has(createIssueFingerprint(issue)))
    .map((issue) => issue.id);

  const changedSeverityIds = current.issues
    .filter((issue) => {
      const previousIssue = previousByFingerprint.get(createIssueFingerprint(issue));
      return previousIssue && previousIssue.severity !== issue.severity;
    })
    .map((issue) => issue.id);

  return {
    addedIssueIds,
    removedIssueIds,
    changedSeverityIds,
    scoreDelta: Number((current.overallScore - previous.overallScore).toFixed(1)),
  };
}

export function computeRiskHotspots(files: FileDiff[], issues: ReviewIssue[], testGapSummary: string): CodeReview["riskHotspots"] {
  const issuesByFile = issues.reduce<Record<string, ReviewIssue[]>>((acc, issue) => {
    if (!issue.file) return acc;
    acc[issue.file] ??= [];
    acc[issue.file].push(issue);
    return acc;
  }, {});

  const missingTests = testGapSummary.includes("no test files were modified");

  return files
    .filter((file) => file.status !== "removed")
    .map((file) => {
      const fileIssues = issuesByFile[file.filename] ?? [];
      const reasons: string[] = [];
      let score = 0;

      if (file.changes >= 120) {
        score += 35;
        reasons.push("Large diff footprint");
      } else if (file.changes >= 60) {
        score += 20;
        reasons.push("Moderately large diff");
      }

      const criticals = fileIssues.filter((issue) => issue.severity === "critical").length;
      const warnings = fileIssues.filter((issue) => issue.severity === "warning").length;
      if (criticals > 0) {
        score += criticals * 30;
        reasons.push(`${criticals} critical review finding${criticals === 1 ? "" : "s"}`);
      }
      if (warnings > 0) {
        score += warnings * 12;
        reasons.push(`${warnings} warning-level finding${warnings === 1 ? "" : "s"}`);
      }

      if (AUTH_RISK_PATTERN.test(file.filename)) {
        score += 18;
        reasons.push("Touches auth or permission-sensitive code");
      }

      if (CONFIG_RISK_PATTERN.test(file.filename)) {
        score += 12;
        reasons.push("Touches config, env, or deployment surface");
      }

      if (missingTests && isProductionCodeFile(file.filename)) {
        score += 10;
        reasons.push("Production change without accompanying test updates");
      }

      return {
        file: file.filename,
        score,
        reasons,
      };
    })
    .filter((hotspot) => hotspot.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function buildMergeReadinessGates({
  review,
  requirementsCheck,
  mrDescriptionReview,
}: {
  review: CodeReview;
  requirementsCheck?: RequirementsCheck | null;
  mrDescriptionReview?: MRDescriptionReview | null;
}): MergeReadinessGate[] {
  const gates: MergeReadinessGate[] = [];
  const criticalCount = review.issues.filter((issue) => issue.severity === "critical").length;
  const hasMissingTests = review.testGapSummary.includes("no test files were modified");

  gates.push({
    label: "Critical issues",
    status: criticalCount === 0 ? "pass" : "fail",
    detail: criticalCount === 0 ? "No critical review findings remain." : `${criticalCount} critical issue${criticalCount === 1 ? "" : "s"} must be addressed.`,
  });

  gates.push({
    label: "Review score",
    status: review.overallScore >= 8 ? "pass" : review.overallScore >= 6 ? "warn" : "fail",
    detail: `Current score is ${review.overallScore}/10.`,
  });

  gates.push({
    label: "Test coverage signal",
    status: hasMissingTests ? "warn" : "pass",
    detail: review.testGapSummary,
  });

  if (requirementsCheck) {
    gates.push({
      label: "Requirements coverage",
      status: requirementsCheck.coverageScore >= 85 ? "pass" : requirementsCheck.coverageScore >= 60 ? "warn" : "fail",
      detail: `${requirementsCheck.coverageScore}% coverage against the linked issue.`,
    });
  }

  if (mrDescriptionReview) {
    gates.push({
      label: "MR description quality",
      status: mrDescriptionReview.qualityScore >= 80 ? "pass" : mrDescriptionReview.qualityScore >= 60 ? "warn" : "fail",
      detail: `${mrDescriptionReview.qualityScore}% description quality score.`,
    });
  }

  return gates;
}

export function getRepoKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname.includes("github.com") && parts.length >= 2) {
      return `github:${parts[0]}/${parts[1]}`;
    }
    if (parsed.hostname.includes("gitlab.com")) {
      const mrIndex = parts.findIndex((part) => part === "-" || part === "merge_requests" || part === "issues" || part === "work_items");
      const repoParts = mrIndex > 0 ? parts.slice(0, mrIndex) : parts.slice(0, Math.max(parts.length - 2, 0));
      if (repoParts.length > 0) {
        return `gitlab:${repoParts.join("/")}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function readUiStateFromLocation(): {
  activeTab?: "summary" | "flow" | "review" | "requirements" | "mr-description";
  selectedFile?: string;
  selectedIssueId?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");

  return {
    activeTab: tab === "summary" || tab === "flow" || tab === "review" || tab === "requirements" || tab === "mr-description"
      ? tab
      : undefined,
    selectedFile: params.get("file") ?? undefined,
    selectedIssueId: params.get("issue") ?? undefined,
  };
}

export function writeUiStateToLocation({
  activeTab,
  selectedFile,
  selectedIssueId,
}: {
  activeTab?: "summary" | "flow" | "review" | "requirements" | "mr-description";
  selectedFile?: string | null;
  selectedIssueId?: string | null;
}) {
  const url = new URL(window.location.href);

  if (activeTab) url.searchParams.set("tab", activeTab);
  if (selectedFile) url.searchParams.set("file", selectedFile);
  else url.searchParams.delete("file");
  if (selectedIssueId) url.searchParams.set("issue", selectedIssueId);
  else url.searchParams.delete("issue");

  window.history.replaceState({}, "", url);
}
