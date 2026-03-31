import type { MRData, ChangeSummary, ExecutionFlow, CodeReview, FileDiff, PRInfo } from "../types";
import type { AIConfig } from "../components/AISettings";

// ─── Shared helpers ───────────────────────────────────────────────────────────

// ─── GitHub direct (CORS: access-control-allow-origin: *) ────────────────────

function parseGitHubUrl(url: string): { owner: string; repo: string; prNumber: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) return { owner: match[1], repo: match[2], prNumber: match[3] };
  return null;
}

async function fetchGitHubPR(url: string, token?: string): Promise<MRData> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const { owner, repo, prNumber } = parsed;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Code-Reviewer/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const [prRes, filesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, { headers }),
  ]);

  if (!prRes.ok) {
    if (prRes.status === 401 || prRes.status === 403)
      throw new Error("GitHub authentication required. Please provide a personal access token for private repositories.");
    if (prRes.status === 404)
      throw new Error("Pull request not found. Check the URL and ensure the repository is accessible.");
    throw new Error(`GitHub API error: ${prRes.status}`);
  }
  if (!filesRes.ok) throw new Error(`Failed to fetch PR files: ${filesRes.status}`);

  const pr = await prRes.json();
  const files = await filesRes.json();

  const prInfo: PRInfo = {
    title: pr.title,
    description: pr.body ?? "",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    author: pr.user.login,
    state: pr.state,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    commits: pr.commits,
    createdAt: pr.created_at,
    url,
  };

  type GHFile = {
    filename: string; status: string; additions: number; deletions: number;
    changes: number; patch?: string; blob_url?: string; raw_url?: string;
  };

  // Fetch full file content for context-aware review (cap each file at 30k chars)
  const PER_FILE_CAP = 30_000;
  const contentResults = await Promise.allSettled(
    (files as GHFile[]).map(async (f) => {
      if (!f.raw_url || f.status === "removed") return null;
      try {
        const res = await fetch(f.raw_url, { headers });
        if (!res.ok) return null;
        const text = await res.text();
        return text.length <= PER_FILE_CAP ? text : text.slice(0, PER_FILE_CAP) + "\n// ... (file truncated — too large)";
      } catch { return null; }
    })
  );

  return {
    platform: "github",
    pr: prInfo,
    files: (files as GHFile[]).map((f, i) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch ?? null,
      blobUrl: f.blob_url ?? null,
      fullContent: contentResults[i].status === "fulfilled" ? contentResults[i].value : null,
    })),
  };
}

// ─── GitLab via local proxy (GitLab blocks cross-origin requests) ─────────────
// Dev:  Vite proxies /api/gitlab → https://gitlab.com  (see vite.config.ts)
// Prod: server.js proxies /api/gitlab → https://gitlab.com

function parseGitLabUrl(url: string): { projectPath: string; mrIid: string } | null {
  const match = url.match(/gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (match) return { projectPath: match[1], mrIid: match[2] };
  return null;
}

async function fetchGitLabMR(url: string, token?: string): Promise<MRData> {
  const parsed = parseGitLabUrl(url);
  if (!parsed) throw new Error("Invalid GitLab Merge Request URL.");

  const { projectPath, mrIid } = parsed;
  const encodedPath = encodeURIComponent(projectPath);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  // Requests go to /api/gitlab/... which is proxied to gitlab.com
  const [mrRes, changesRes] = await Promise.all([
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}?include_diverged_commits_count=true`, { headers }),
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/changes`, { headers }),
  ]);

  if (!mrRes.ok) throw new Error(`GitLab API error: ${mrRes.status}`);
  if (!changesRes.ok) throw new Error(`Failed to fetch MR changes: ${changesRes.status}`);

  const mr = await mrRes.json();
  const changesData = await changesRes.json();

  type GitLabChange = { new_path: string; diff?: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean; additions?: number; deletions?: number };
  const changes: GitLabChange[] = changesData.changes ?? [];

  // GitLab changes API does not reliably return additions/deletions per file;
  // count +/- lines from the raw diff string instead
  function parseDiffStats(diff: string): { additions: number; deletions: number } {
    const lines = diff.split("\n");
    return {
      additions: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
      deletions: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
    };
  }

  const prInfo: PRInfo = {
    title: mr.title,
    description: mr.description ?? "",
    baseBranch: mr.target_branch,
    headBranch: mr.source_branch,
    author: mr.author?.username ?? "unknown",
    state: mr.state,
    additions: changes.reduce((s, c) => {
      if (c.additions != null) return s + c.additions;
      return s + (c.diff ? parseDiffStats(c.diff).additions : 0);
    }, 0),
    deletions: changes.reduce((s, c) => {
      if (c.deletions != null) return s + c.deletions;
      return s + (c.diff ? parseDiffStats(c.diff).deletions : 0);
    }, 0),
    changedFiles: changes.length,
    commits: mr.commits_count ?? 0,
    createdAt: mr.created_at,
    url,
  };

  return {
    platform: "gitlab",
    pr: prInfo,
    files: await Promise.all(changes.map(async (c, i) => {
      const additions = c.additions ?? (c.diff ? parseDiffStats(c.diff).additions : 0);
      const deletions = c.deletions ?? (c.diff ? parseDiffStats(c.diff).deletions : 0);

      // Fetch full file content for context-aware review
      let fullContent: string | null = null;
      if (!c.deleted_file && c.new_path) {
        try {
          const encodedFile = encodeURIComponent(c.new_path);
          const ref = encodeURIComponent(mr.source_branch);
          const rawRes = await fetch(
            `/api/gitlab/api/v4/projects/${encodedPath}/repository/files/${encodedFile}/raw?ref=${ref}`,
            { headers }
          );
          if (rawRes.ok) {
            const text = await rawRes.text();
            const PER_FILE_CAP = 30_000;
            fullContent = text.length <= PER_FILE_CAP ? text : text.slice(0, PER_FILE_CAP) + "\n// ... (file truncated — too large)";
          }
        } catch { /* leave fullContent null */ }
      }

      return {
        filename: c.new_path,
        status: c.new_file ? "added" : c.deleted_file ? "removed" : c.renamed_file ? "renamed" : "modified",
        additions,
        deletions,
        changes: additions + deletions,
        patch: c.diff ?? null,
        blobUrl: null,
        fullContent,
      };
    })),
  };
}

// ─── OpenRouter direct (browser-side) ────────────────────────────────────────

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenRouter<T>(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  schema: Record<string, unknown>
): Promise<T> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "AI Code Reviewer",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analysis_result",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty response");

  return JSON.parse(content) as T;
}

// ─── JSON schemas (mirror of edge function) ───────────────────────────────────

const SUMMARY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    purpose: { type: "string" },
    summary: { type: "string" },
    changeType: { type: "string", enum: ["feature", "bugfix", "refactor", "chore", "docs", "test", "perf", "security", "breaking"] },
    scope: { type: "string" },
    keyChanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          description: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["area", "description", "impact"],
        additionalProperties: false,
      },
    },
    techStack: { type: "array", items: { type: "string" } },
    testingStatus: { type: "string" },
    breakingChanges: { type: "boolean" },
    breakingChangesDescription: { type: "string" },
  },
  required: ["purpose", "summary", "changeType", "scope", "keyChanges", "techStack", "testingStatus", "breakingChanges", "breakingChangesDescription"],
  additionalProperties: false,
};

const FLOW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    flowDescription: { type: "string" },
    flowGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          layer: { type: "string" },
          layerDescription: { type: "string" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                role: { type: "string" },
                keyChanges: { type: "string" },
                callsInto: { type: "array", items: { type: "string" } },
              },
              required: ["filename", "role", "keyChanges", "callsInto"],
              additionalProperties: false,
            },
          },
        },
        required: ["order", "layer", "layerDescription", "files"],
        additionalProperties: false,
      },
    },
    entryPoint: { type: "string" },
    dataFlow: { type: "string" },
  },
  required: ["flowDescription", "flowGroups", "entryPoint", "dataFlow"],
  additionalProperties: false,
};

const REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    overallVerdict: { type: "string", enum: ["approve", "approve_with_suggestions", "request_changes", "needs_discussion"] },
    overallScore: { type: "number", minimum: 0, maximum: 10 },
    executiveSummary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["critical", "warning", "suggestion", "nitpick"] },
          category: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          file: { type: "string" },
          lineHint: { type: "string" },
          currentCode: { type: "string" },
          suggestedFix: { type: "string" },
          impact: { type: "string" },
        },
        required: ["id", "severity", "category", "title", "description", "file", "lineHint", "currentCode", "suggestedFix", "impact"],
        additionalProperties: false,
      },
    },
    architectureObservations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          aspect: { type: "string" },
          observation: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["aspect", "observation", "recommendation"],
        additionalProperties: false,
      },
    },
    securityConsiderations: { type: "array", items: { type: "string" } },
    performanceConsiderations: { type: "array", items: { type: "string" } },
    testingAssessment: { type: "string" },
    mergeReadiness: { type: "string" },
  },
  required: ["overallVerdict", "overallScore", "executiveSummary", "strengths", "issues", "architectureObservations", "securityConsiderations", "performanceConsiderations", "testingAssessment", "mergeReadiness"],
  additionalProperties: false,
};

// ─── Diff / context builders ──────────────────────────────────────────────────

const PER_FILE_PATCH_CAP = 8_000;   // max diff chars per file (summary/flow)
const PER_FILE_FULL_CAP  = 25_000;  // max full-content chars per file (review)
const TOTAL_CONTEXT_CAP  = 120_000; // total review context budget (~30k tokens)

/** Used for summary + flow: full diffs, no file content */
function buildDiffContent(files: FileDiff[]): string {
  return files
    .map((f) => {
      const patch = f.patch
        ? f.patch.slice(0, PER_FILE_PATCH_CAP) + (f.patch.length > PER_FILE_PATCH_CAP ? "\n... (diff truncated)" : "")
        : "(binary or no diff)";
      return `### ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}\n${patch}`;
    })
    .join("\n\n");
}

/**
 * Used for code review: full file content + diff per changed file.
 * Files sorted by change size (most-changed first). Respects total token budget.
 */
function buildContextAwareDiff(files: FileDiff[]): string {
  const sorted = [...files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
  let budget = TOTAL_CONTEXT_CAP;
  const parts: string[] = [];

  for (const f of sorted) {
    if (budget <= 500) {
      parts.push(`### ${f.filename} — omitted (context budget reached)`);
      continue;
    }

    const header = `### ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}`;
    const sections: string[] = [header];

    if (f.fullContent && f.status !== "removed") {
      const content = f.fullContent.slice(0, PER_FILE_FULL_CAP);
      sections.push(`\nFULL FILE (current state after changes):\n\`\`\`\n${content}\n\`\`\``);
    }

    if (f.patch) {
      const patch = f.patch.slice(0, PER_FILE_PATCH_CAP) + (f.patch.length > PER_FILE_PATCH_CAP ? "\n... (diff truncated)" : "");
      sections.push(`\nDIFF (what changed):\n${patch}`);
    }

    const block = sections.join("\n");
    budget -= block.length;
    parts.push(block);
  }

  return parts.join("\n\n---\n\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchMRDiff(url: string, token?: string): Promise<MRData> {
  if (parseGitHubUrl(url)) return fetchGitHubPR(url, token);
  if (parseGitLabUrl(url)) return fetchGitLabMR(url, token);
  throw new Error("Invalid URL. Please provide a GitHub Pull Request or GitLab Merge Request URL.");
}

export async function analyzeSummary(mrData: MRData, aiConfig: AIConfig): Promise<ChangeSummary> {
  const { pr, files } = mrData;
  const diffContent = buildDiffContent(files);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const systemPrompt = `You are an expert software engineer reviewing a pull/merge request. Analyze the PR and produce a structured summary. Always return valid JSON matching the exact schema.`;
  const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description provided"}
Base Branch: ${pr.baseBranch} → Head Branch: ${pr.headBranch}
Author: ${pr.author}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions} lines, ${pr.commits} commit(s)

FILE DIFFS:
${diffContent}

Provide a comprehensive summary. For breakingChangesDescription, use an empty string "" if there are no breaking changes.`;

    return callOpenRouter<ChangeSummary>(aiConfig.apiKey, aiConfig.model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], SUMMARY_SCHEMA);
}

export async function analyzeExecutionFlow(mrData: MRData, aiConfig: AIConfig): Promise<ExecutionFlow> {
  const { pr, files } = mrData;
  const diffContent = buildDiffContent(files);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const fileList = files.map((f) => `${f.filename} [${f.status}]`).join("\n");
    const systemPrompt = `You are a senior software architect. Organize changed files into a logical execution flow grouped by architectural layer. Always return valid JSON.`;
    const userPrompt = `PR Title: ${pr.title}
Changed Files:
${fileList}

FILE DIFFS:
${diffContent}

Organize files into execution flow groups (Route/Entry → Middleware → Controller → Service → Repository/DAL → Model/Schema → Utils → Tests → Config). For callsInto, always provide an array (empty [] if none).`;

    return callOpenRouter<ExecutionFlow>(aiConfig.apiKey, aiConfig.model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], FLOW_SCHEMA);
}

export async function analyzeCodeReview(mrData: MRData, aiConfig: AIConfig): Promise<CodeReview> {
  const { pr, files } = mrData;
  const diffContent = buildContextAwareDiff(files);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const hasFullContent = files.some((f) => f.fullContent);
  const systemPrompt = `You are a very senior software engineer (10+ years) performing a thorough, context-aware code review.

For each changed file you receive:
${hasFullContent
  ? "1. FULL FILE — the complete current state of the file after this PR's changes, so you can see imports, types, existing patterns, and how all code fits together\n2. DIFF — the exact lines added/removed"
  : "- DIFF — the exact lines added/removed (full file context unavailable for this repository)"}

Use the full file content (when present) to catch issues that only appear in context:
- Functions called with wrong arguments elsewhere in the same file
- Duplicate logic or existing helpers that should be reused  
- Violated naming/style conventions established in the file
- Type mismatches that span the full file scope
- N+1 queries or missing eager-loads visible from the full model/query context
- Security issues like hardcoded secrets, missing auth checks, injection vectors

Be precise: always provide the exact file path and line reference when flagging an issue.
IMPORTANT: overallScore must be a decimal between 0.0 and 10.0 (e.g. 6.5, not 65).
Always return valid JSON. For optional string fields (file, lineHint, currentCode, impact) always provide a string value (use "" if not applicable).`;

  const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description"}
Author: ${pr.author}
Branch: ${pr.headBranch} → ${pr.baseBranch}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}

FILE CONTEXT + DIFFS:
${diffContent}

Perform a comprehensive senior-level code review using the full file context above.`;

  const review = await callOpenRouter<CodeReview>(aiConfig.apiKey, aiConfig.model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], REVIEW_SCHEMA);

  // Normalise score: some models return 0–100 even when instructed otherwise
  if (review.overallScore > 10) {
    review.overallScore = Math.round((review.overallScore / 10) * 10) / 10;
  }

  return review;
}
