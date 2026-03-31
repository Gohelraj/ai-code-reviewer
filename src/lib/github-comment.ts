import type { ReviewIssue, DiffRefs } from "../types";

interface PostCommentOptions {
  url: string;
  token: string;
  body: string;
}

export interface InlinePostResult {
  total: number;
  inline: number;
  general: number;
  failed: number;
  errors: string[];
  postedIds: string[];
}

function parseGitHubUrl(url: string): { owner: string; repo: string; number: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) return { owner: match[1], repo: match[2], number: match[3] };
  return null;
}

function parseGitLabUrl(url: string): { projectPath: string; mrIid: string } | null {
  const match = url.match(/gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (match) return { projectPath: match[1], mrIid: match[2] };
  return null;
}

/**
 * Parse a lineHint string (e.g. "Line 42", "L42", "Lines 10-20", "line 5")
 * into the first numeric line number. Returns null if unparseable.
 */
function parseLineNumber(lineHint: string): number | null {
  // Match patterns like "Line 42", "L42", "line 42", "Lines 10-20" (takes first number)
  const match = lineHint.match(/(?:lines?\s*|L)(\d+)/i);
  if (match) return parseInt(match[1], 10);
  // Fallback: just find first number in the string
  const numMatch = lineHint.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return null;
}

/** Build markdown body for a single issue */
export function buildIssueMarkdown(issue: ReviewIssue): string {
  const sevEmoji = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
  const lines: string[] = [];

  lines.push(`${sevEmoji} **[${issue.severity.toUpperCase()}] ${issue.title}**`);
  lines.push("");
  lines.push(issue.description);

  if (issue.currentCode) {
    lines.push("");
    lines.push("**Problematic Code:**");
    lines.push("```");
    lines.push(issue.currentCode.trim());
    lines.push("```");
  }

  if (issue.suggestedFix) {
    lines.push("");
    lines.push("**Suggested Fix:**");
    lines.push("```suggestion");
    lines.push(issue.suggestedFix.trim());
    lines.push("```");
  }

  if (issue.impact) {
    lines.push("");
    lines.push(`> **Impact:** ${issue.impact}`);
  }

//   lines.push("");
//   lines.push("*— AI Code Reviewer*");
  return lines.join("\n");
}

export async function postReviewComment({ url, token, body }: PostCommentOptions): Promise<void> {
  const github = parseGitHubUrl(url);
  if (github) {
    const res = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/issues/${github.number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }
    return;
  }

  const gitlab = parseGitLabUrl(url);
  if (gitlab) {
    const encodedPath = encodeURIComponent(gitlab.projectPath);
    const res = await fetch(
      `/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${gitlab.mrIid}/notes`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab API error ${res.status}: ${text}`);
    }
    return;
  }

  throw new Error("Cannot determine platform from URL");
}

/**
 * Post selected issues as inline comments on GitLab MR (using Discussions API)
 * or as individual PR review comments on GitHub.
 * Falls back to general comments when file/line info is missing.
 */
export async function postInlineComments({
  url,
  token,
  issues,
  diffRefs,
  overrideBodies,
}: {
  url: string;
  token: string;
  issues: ReviewIssue[];
  diffRefs?: DiffRefs;
  overrideBodies?: Record<string, string>;
}): Promise<InlinePostResult> {
  const result: InlinePostResult = { total: issues.length, inline: 0, general: 0, failed: 0, errors: [], postedIds: [] };

  const gitlab = parseGitLabUrl(url);
  const github = parseGitHubUrl(url);

  for (const issue of issues) {
    const body = overrideBodies?.[issue.id] ?? buildIssueMarkdown(issue);
    const lineNum = issue.lineHint ? parseLineNumber(issue.lineHint) : null;
    const hasPosition = !!issue.file && lineNum !== null;

    try {
      if (gitlab) {
        const encodedPath = encodeURIComponent(gitlab.projectPath);

        if (hasPosition && diffRefs) {
          // Post as inline discussion with position
          const res = await fetch(
            `/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${gitlab.mrIid}/discussions`,
            {
              method: "POST",
              headers: {
                "PRIVATE-TOKEN": token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                body,
                position: {
                  position_type: "text",
                  base_sha: diffRefs.baseSha,
                  head_sha: diffRefs.headSha,
                  start_sha: diffRefs.startSha,
                  new_path: issue.file,
                  old_path: issue.file,
                  new_line: lineNum,
                },
              }),
            },
          );

          if (res.ok) {
            result.inline++;
            result.postedIds.push(issue.id);
            continue;
          }

          // If inline fails (e.g. line not in diff), fall back to general note
          const errText = await res.text();
          console.warn(`Inline comment failed for ${issue.file}:${lineNum}, falling back to note. Error: ${errText}`);
        }

        // Fallback: general MR note with file/line context in body
        const noteBody = hasPosition
          ? `📁 \`${issue.file}\`${lineNum ? ` · Line ${lineNum}` : ""}\n\n${body}`
          : body;

        const res = await fetch(
          `/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${gitlab.mrIid}/notes`,
          {
            method: "POST",
            headers: {
              "PRIVATE-TOKEN": token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ body: noteBody }),
          },
        );

        if (res.ok) {
          result.general++;
          result.postedIds.push(issue.id);
        } else {
          const text = await res.text();
          result.failed++;
          result.errors.push(`${issue.title}: GitLab ${res.status} — ${text.slice(0, 100)}`);
        }
      } else if (github) {
        // GitHub: use pull request review comments API for inline, issues comments for general
        if (hasPosition) {
          const res = await fetch(
            `https://api.github.com/repos/${github.owner}/${github.repo}/pulls/${github.number}/comments`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              body: JSON.stringify({
                body,
                path: issue.file,
                line: lineNum,
                side: "RIGHT",
              }),
            },
          );

          if (res.ok) {
            result.inline++;
            result.postedIds.push(issue.id);
            continue;
          }

          // Fall back to general comment
          console.warn(`Inline comment failed for ${issue.file}:${lineNum}, falling back to issue comment.`);
        }

        // Fallback: general issue comment
        const noteBody = hasPosition
          ? `📁 \`${issue.file}\`${lineNum ? ` · Line ${lineNum}` : ""}\n\n${body}`
          : body;

        const res = await fetch(
          `https://api.github.com/repos/${github.owner}/${github.repo}/issues/${github.number}/comments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({ body: noteBody }),
          },
        );

        if (res.ok) {
          result.general++;
          result.postedIds.push(issue.id);
        } else {
          const text = await res.text();
          result.failed++;
          result.errors.push(`${issue.title}: GitHub ${res.status} — ${text.slice(0, 100)}`);
        }
      } else {
        throw new Error("Cannot determine platform from URL");
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`${issue.title}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return result;
}
