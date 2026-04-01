import { describe, expect, it } from "vitest";
import { formatRepoReviewMemory, parseRepoReviewMemory, summarizeRepoReviewMemory } from "./repo-memory";

describe("repo-memory", () => {
  it("parses headed markdown into structured review memory", () => {
    const parsed = parseRepoReviewMemory(`
## Purpose
- Review pull requests with repo context

## Architecture
- Client-heavy React SPA with a thin Express proxy

## Domain Rules
- Treat GitLab and GitHub URLs as first-class inputs

## Review Priorities
- Prioritise auth, config, and missing tests

## Intentional Patterns
- Summary auto-runs before review

## Avoid Flagging
- Thin proxy design is intentional
`);

    expect(parsed.purpose).toEqual(["Review pull requests with repo context"]);
    expect(parsed.architecture).toEqual(["Client-heavy React SPA with a thin Express proxy"]);
    expect(parsed.domainRules).toEqual(["Treat GitLab and GitHub URLs as first-class inputs"]);
    expect(parsed.reviewPriorities).toEqual(["Prioritise auth, config, and missing tests"]);
    expect(parsed.intentionalPatterns).toEqual(["Summary auto-runs before review"]);
    expect(parsed.avoidFlagging).toEqual(["Thin proxy design is intentional"]);
  });

  it("formats and summarises memory consistently", () => {
    const memory = {
      purpose: ["Fast MR review"],
      architecture: ["React frontend"],
      domainRules: [],
      reviewPriorities: ["Catch contract drift"],
      intentionalPatterns: [],
      avoidFlagging: ["Minor style variance"],
    };

    expect(formatRepoReviewMemory(memory)).toContain("## Purpose");
    expect(formatRepoReviewMemory(memory)).toContain("- Fast MR review");
    expect(summarizeRepoReviewMemory(memory)).toContain("Purpose: Fast MR review");
    expect(summarizeRepoReviewMemory(memory)).toContain("Review priorities: Catch contract drift");
  });
});
