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
    "User-Agent": "MergeAI-Reviewer/1.0",
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

  return {
    platform: "github",
    pr: prInfo,
    files: files.map((f: { filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string; blob_url?: string }) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch ?? null,
      blobUrl: f.blob_url ?? null,
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
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}`, { headers }),
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/changes`, { headers }),
  ]);

  if (!mrRes.ok) throw new Error(`GitLab API error: ${mrRes.status}`);
  if (!changesRes.ok) throw new Error(`Failed to fetch MR changes: ${changesRes.status}`);

  const mr = await mrRes.json();
  const changesData = await changesRes.json();

  type GitLabChange = { new_path: string; diff?: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean; additions?: number; deletions?: number };
  const changes: GitLabChange[] = changesData.changes ?? [];

  const prInfo: PRInfo = {
    title: mr.title,
    description: mr.description ?? "",
    baseBranch: mr.target_branch,
    headBranch: mr.source_branch,
    author: mr.author?.username ?? "unknown",
    state: mr.state,
    additions: changes.reduce((s, c) => s + (c.additions ?? 0), 0),
    deletions: changes.reduce((s, c) => s + (c.deletions ?? 0), 0),
    changedFiles: changes.length,
    commits: mr.commits_count ?? 0,
    createdAt: mr.created_at,
    url,
  };

  return {
    platform: "gitlab",
    pr: prInfo,
    files: changes.map((c) => ({
      filename: c.new_path,
      status: c.new_file ? "added" : c.deleted_file ? "removed" : c.renamed_file ? "renamed" : "modified",
      additions: c.additions ?? 0,
      deletions: c.deletions ?? 0,
      changes: (c.additions ?? 0) + (c.deletions ?? 0),
      patch: c.diff ?? null,
      blobUrl: null,
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
      "X-Title": "MergeAI Reviewer",
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
    overallScore: { type: "number" },
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

// ─── Diff builder (shared prompt content) ─────────────────────────────────────

const MAX_PATCH_CHARS = 600;

function buildDiffContent(files: FileDiff[]): string {
  return files
    .map((f) => {
      const patchPreview = f.patch
        ? f.patch.slice(0, MAX_PATCH_CHARS) + (f.patch.length > MAX_PATCH_CHARS ? "\n... (truncated)" : "")
        : "(binary or no patch)";
      return `### ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}\n${patchPreview}`;
    })
    .join("\n\n");
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
  const diffContent = buildDiffContent(files);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const systemPrompt = `You are a very senior software engineer (10+ years) performing a thorough code review. Be precise, constructive, and insightful. Focus on things that matter. Always return valid JSON. For optional string fields like file, lineHint, currentCode, impact — always provide a string value (use "" if not applicable).`;
    const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description"}
Author: ${pr.author}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}

FILE DIFFS:
${diffContent}

Perform a comprehensive senior-level code review.`;

    return callOpenRouter<CodeReview>(aiConfig.apiKey, aiConfig.model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], REVIEW_SCHEMA);
}
