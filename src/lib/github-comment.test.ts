import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildIssueMarkdown, parseLineNumber, postInlineComments } from "./github-comment";
import type { ReviewIssue } from "../types";

const issue: ReviewIssue = {
  id: "issue-1",
  severity: "warning",
  category: "Correctness",
  title: "Fix the null branch",
  description: "This path will throw when the response is null.",
  confidence: "high",
  rationale: "The value is dereferenced before the guard runs.",
  file: "src/api.ts",
  lineHint: "Line 18",
  currentCode: "return response.value;",
  suggestedFix: "if (!response) return null;",
  impact: "Users see a runtime crash.",
  fixable: true,
  evidence: [
    {
      type: "diff",
      summary: "response.value is accessed before the null guard.",
      file: "src/api.ts",
      lineHint: "Line 18",
      snippet: "return response.value;",
    },
  ],
};

describe("github-comment helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("parses human-friendly line hints", () => {
    expect(parseLineNumber("Line 42")).toBe(42);
    expect(parseLineNumber("L19")).toBe(19);
    expect(parseLineNumber("Lines 50-60")).toBe(50);
    expect(parseLineNumber("no line")).toBeNull();
  });

  it("builds concise markdown with code and suggestion blocks", () => {
    const markdown = buildIssueMarkdown(issue);
    expect(markdown).toContain("**Fix the null branch**");
    expect(markdown).toContain("```suggestion");
    expect(markdown).not.toContain("Impact");
    expect(markdown).not.toContain("Evidence");
  });

  it("posts general GitHub comments when general mode is requested", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    const result = await postInlineComments({
      url: "https://github.com/acme/repo/pull/42",
      token: "ghp_test",
      issues: [issue],
      mode: "general",
    });

    expect(result.general).toBe(1);
    expect(result.inline).toBe(0);
    expect(result.deliveryNotes).toEqual([
      expect.objectContaining({
        issueId: "issue-1",
        platform: "github",
        reason: "Posting preference is set to general comments.",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/repo/issues/42/comments",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("falls back from inline to general comments when GitHub inline posting fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        text: vi.fn().mockResolvedValue("line is outside the diff"),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response);

    const result = await postInlineComments({
      url: "https://github.com/acme/repo/pull/42",
      token: "ghp_test",
      issues: [issue],
      mode: "inline",
    });

    expect(result.inline).toBe(0);
    expect(result.general).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.deliveryNotes).toEqual([
      expect.objectContaining({
        issueId: "issue-1",
        platform: "github",
        reason: expect.stringContaining("GitHub rejected the inline position: line is outside the diff"),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
