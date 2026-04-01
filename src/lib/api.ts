import type { MRData, ChangeSummary, ExecutionFlow, CodeReview, RequirementsCheck, MRDescriptionReview, FileDiff, PRInfo } from "../types";
import { DEFAULT_PRIMARY_MODEL, normalizeOpenRouterModel } from "../components/AISettings";
import type { AIConfig, ReviewMode } from "../components/AISettings";
import { computeRiskHotspots, computeTestGapSummary, getReviewContextPlan } from "./review-utils";
import { buildReviewerSuggestions, parseCodeowners } from "./codeowners";

// ─── Shared helpers ───────────────────────────────────────────────────────────

// ─── GitHub direct (CORS: access-control-allow-origin: *) ────────────────────

export function parseGitHubUrl(url: string): { owner: string; repo: string; prNumber: string } | null {
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
      fullContent: null,
    })),
  };
}

// ─── GitLab via local proxy (GitLab blocks cross-origin requests) ─────────────
// Dev:  Vite proxies /api/gitlab → https://gitlab.com  (see vite.config.ts)
// Prod: server.js proxies /api/gitlab → https://gitlab.com

export function parseGitLabUrl(url: string): { projectPath: string; mrIid: string } | null {
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
  const [mrRes, changesRes, commitsRes] = await Promise.all([
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}?include_diverged_commits_count=true`, { headers }),
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/changes`, { headers }),
    fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/commits?per_page=1`, { headers }),
  ]);

  if (!mrRes.ok) throw new Error(`GitLab API error: ${mrRes.status}`);
  if (!changesRes.ok) throw new Error(`Failed to fetch MR changes: ${changesRes.status}`);

  const mr = await mrRes.json();
  const changesData = await changesRes.json();

  // Get commit count from response header (x-total) or fall back to MR field
  const commitCount = parseInt(commitsRes.headers.get("x-total") ?? "", 10) || mr.commits_count || 0;

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
    commits: commitCount,
    createdAt: mr.created_at,
    url,
  };

  return {
    platform: "gitlab",
    pr: prInfo,
    diffRefs: mr.diff_refs ? {
      baseSha: mr.diff_refs.base_sha,
      headSha: mr.diff_refs.head_sha,
      startSha: mr.diff_refs.start_sha,
    } : undefined,
    files: await Promise.all(changes.map(async (c) => {
      const additions = c.additions ?? (c.diff ? parseDiffStats(c.diff).additions : 0);
      const deletions = c.deletions ?? (c.diff ? parseDiffStats(c.diff).deletions : 0);

      return {
        filename: c.new_path,
        status: c.new_file ? "added" : c.deleted_file ? "removed" : c.renamed_file ? "renamed" : "modified",
        additions,
        deletions,
        changes: additions + deletions,
        patch: c.diff ?? null,
        blobUrl: null,
        fullContent: null,
      };
    })),
  };
}

// ─── OpenRouter direct (browser-side) ────────────────────────────────────────

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildOpenRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": window.location.origin,
    "X-Title": "AI Code Reviewer",
  };
}

function isInvalidModelError(status: number, errText: string): boolean {
  return status === 400 && /not a valid model ID/i.test(errText);
}

async function sendOpenRouterRequest(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      ...payload,
    }),
  });
}

async function requestOpenRouterWithFallback<T>(
  apiKey: string,
  requestedModel: string,
  payload: Record<string, unknown>,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const normalizedModel = normalizeOpenRouterModel(requestedModel, DEFAULT_PRIMARY_MODEL);
  const modelsToTry = normalizedModel === DEFAULT_PRIMARY_MODEL
    ? [normalizedModel]
    : [normalizedModel, DEFAULT_PRIMARY_MODEL];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const response = await sendOpenRouterRequest(apiKey, model, payload);
    if (response.ok) {
      return parse(response);
    }

    const errText = await response.text();
    if (isInvalidModelError(response.status, errText) && model !== DEFAULT_PRIMARY_MODEL) {
      console.warn(`OpenRouter rejected model "${model}". Retrying with "${DEFAULT_PRIMARY_MODEL}".`);
      lastError = new Error(`OpenRouter error ${response.status}: ${errText}`);
      continue;
    }

    throw new Error(`OpenRouter error ${response.status}: ${errText}`);
  }

  throw lastError ?? new Error(`OpenRouter rejected the configured model and fallback "${DEFAULT_PRIMARY_MODEL}".`);
}

async function callOpenRouter<T>(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  schema: Record<string, unknown>
): Promise<T> {
  return requestOpenRouterWithFallback(apiKey, model, {
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "analysis_result",
        strict: true,
        schema,
      },
    },
  }, async (res) => {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");

    return JSON.parse(content) as T;
  });
}

async function callOpenRouterText(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
): Promise<string> {
  return requestOpenRouterWithFallback(apiKey, model, { messages }, async (res) => {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter returned empty response");
    return content;
  });
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
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          rationale: { type: "string" },
          file: { type: "string" },
          lineHint: { type: "string" },
          currentCode: { type: "string" },
          suggestedFix: { type: "string" },
          impact: { type: "string" },
          fixable: { type: "boolean" },
        },
        required: ["id", "severity", "category", "title", "description", "confidence", "rationale", "file", "lineHint", "currentCode", "suggestedFix", "impact", "fixable"],
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
    testGapSummary: { type: "string" },
    riskHotspots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          score: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
        },
        required: ["file", "score", "reasons"],
        additionalProperties: false,
      },
    },
    mergeReadiness: { type: "string" },
  },
  required: ["overallVerdict", "overallScore", "executiveSummary", "strengths", "issues", "architectureObservations", "securityConsiderations", "performanceConsiderations", "testingAssessment", "testGapSummary", "riskHotspots", "mergeReadiness"],
  additionalProperties: false,
};

// ─── Diff / context builders ──────────────────────────────────────────────────

const PER_FILE_PATCH_CAP = 8_000;   // max diff chars per file (summary/flow)

/** Used for summary + flow: full diffs, no file content */
export function buildDiffContent(files: FileDiff[]): string {
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
export function buildContextAwareDiff(files: FileDiff[], reviewMode: ReviewMode = "deep"): string {
  const plan = getReviewContextPlan(files, reviewMode);
  const planFiles = plan.selectedFiles
    .map((filename) => files.find((file) => file.filename === filename))
    .filter((file): file is FileDiff => !!file);
  let budget = plan.totalContextChars;
  const parts: string[] = [];

  for (const f of planFiles) {
    if (budget <= 500) {
      continue;
    }

    const header = `### ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}`;
    const sections: string[] = [header];

    if (plan.fullContentFiles.includes(f.filename) && f.fullContent && f.status !== "removed") {
      const content = f.fullContent.slice(0, plan.perFileFullChars);
      sections.push(`\nFULL FILE (current state after changes):\n\`\`\`\n${content}\n\`\`\``);
    }

    if (f.patch) {
      const patch = f.patch.slice(0, plan.perFilePatchChars) + (f.patch.length > plan.perFilePatchChars ? "\n... (diff truncated)" : "");
      sections.push(`\nDIFF (what changed):\n${patch}`);
    }

    const block = sections.join("\n");
    budget -= block.length;
    parts.push(block);
  }

  if (plan.omittedCount > 0) {
    parts.push(`### Omitted Files\n${plan.omittedCount} lower-priority file(s) were omitted from the review context to reduce latency and token cost.`);
  }

  return parts.join("\n\n---\n\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchMRDiff(url: string, token?: string): Promise<MRData> {
  if (parseGitHubUrl(url)) return fetchGitHubPR(url, token);
  if (parseGitLabUrl(url)) return fetchGitLabMR(url, token);
  throw new Error("Invalid URL. Please provide a GitHub Pull Request or GitLab Merge Request URL.");
}

function getRelevantFileContext(mrData: MRData, targetFile?: string, reviewMode: ReviewMode = "deep"): string {
  const files = targetFile
    ? mrData.files.filter((file) => file.filename === targetFile)
    : mrData.files;
  return buildContextAwareDiff(files.length > 0 ? files : mrData.files, reviewMode);
}

const CODEOWNERS_CANDIDATE_PATHS = [
  "CODEOWNERS",
  ".github/CODEOWNERS",
  ".gitlab/CODEOWNERS",
  "docs/CODEOWNERS",
] as const;

async function hydrateGitHubFullContent(mrData: MRData, filenames: string[], token?: string): Promise<FileDiff[]> {
  const parsed = parseGitHubUrl(mrData.pr.url);
  if (!parsed || filenames.length === 0) return mrData.files;

  const { owner, repo, prNumber } = parsed;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Code-Reviewer/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const filesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, { headers });
  if (!filesRes.ok) return mrData.files;

  type GHFile = { filename: string; raw_url?: string; status: string };
  const files = await filesRes.json() as GHFile[];
  const PER_FILE_CAP = 30_000;
  const contentByFile = new Map<string, string | null>();

  const filenameSet = new Set(filenames);

  await Promise.all(
    files.filter((file) => filenameSet.has(file.filename)).map(async (file) => {
      if (!file.raw_url || file.status === "removed") {
        contentByFile.set(file.filename, null);
        return;
      }
      try {
        const res = await fetch(file.raw_url, { headers });
        if (!res.ok) {
          contentByFile.set(file.filename, null);
          return;
        }
        const text = await res.text();
        contentByFile.set(
          file.filename,
          text.length <= PER_FILE_CAP ? text : `${text.slice(0, PER_FILE_CAP)}\n// ... (file truncated — too large)`,
        );
      } catch {
        contentByFile.set(file.filename, null);
      }
    }),
  );

  return mrData.files.map((file) => ({
    ...file,
    fullContent: contentByFile.has(file.filename)
      ? contentByFile.get(file.filename) ?? null
      : file.fullContent ?? null,
  }));
}

async function hydrateGitLabFullContent(mrData: MRData, filenames: string[], token?: string): Promise<FileDiff[]> {
  const parsed = parseGitLabUrl(mrData.pr.url);
  if (!parsed || filenames.length === 0) return mrData.files;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  const PER_FILE_CAP = 30_000;
  const filenameSet = new Set(filenames);
  return Promise.all(
    mrData.files.map(async (file) => {
      if (!filenameSet.has(file.filename)) {
        return { ...file, fullContent: file.fullContent ?? null };
      }
      if (file.status === "removed") return { ...file, fullContent: null };

      try {
        const encodedPath = encodeURIComponent(parsed.projectPath);
        const encodedFile = encodeURIComponent(file.filename);
        const ref = encodeURIComponent(mrData.pr.headBranch);
        const res = await fetch(`/api/gitlab/api/v4/projects/${encodedPath}/repository/files/${encodedFile}/raw?ref=${ref}`, { headers });
        if (!res.ok) return { ...file, fullContent: null };
        const text = await res.text();
        return {
          ...file,
          fullContent: text.length <= PER_FILE_CAP ? text : `${text.slice(0, PER_FILE_CAP)}\n// ... (file truncated — too large)`,
        };
      } catch {
        return { ...file, fullContent: null };
      }
    }),
  );
}

async function hydrateFilesForReview(mrData: MRData, filenames: string[], token?: string): Promise<MRData> {
  const missingFilenames = filenames.filter((filename) => {
    const file = mrData.files.find((entry) => entry.filename === filename);
    return !!file && !file.fullContent && file.status !== "removed";
  });

  if (missingFilenames.length === 0) {
    return mrData;
  }

  const files = mrData.platform === "github"
    ? await hydrateGitHubFullContent(mrData, missingFilenames, token)
    : await hydrateGitLabFullContent(mrData, missingFilenames, token);

  return {
    ...mrData,
    files,
  };
}

export async function prepareMRDataForReview(mrData: MRData, aiConfig: AIConfig, token?: string): Promise<MRData> {
  const reviewMode = aiConfig.reviewMode ?? "deep";
  const plan = getReviewContextPlan(mrData.files, reviewMode);
  return hydrateFilesForReview(mrData, plan.fullContentFiles, token);
}

function getModelForTask(aiConfig: AIConfig, task: "summary" | "flow" | "review" | "requirements" | "mr-description" | "chat" | "fix"): string {
  if (task === "review") {
    return normalizeOpenRouterModel(aiConfig.model, DEFAULT_PRIMARY_MODEL);
  }
  return normalizeOpenRouterModel(aiConfig.auxiliaryModel?.trim() || aiConfig.model, DEFAULT_PRIMARY_MODEL);
}

const reviewerSuggestionCache = new Map<string, Promise<CodeReview["reviewerSuggestions"]>>();

async function fetchGitHubCodeowners(mrData: MRData, token?: string): Promise<string | null> {
  const parsed = parseGitHubUrl(mrData.pr.url);
  if (!parsed) return null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Code-Reviewer/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (const candidatePath of CODEOWNERS_CANDIDATE_PATHS) {
    const encodedPath = candidatePath.split("/").map(encodeURIComponent).join("/");
    const ref = encodeURIComponent(mrData.pr.headBranch);
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}?ref=${ref}`, { headers });
    if (!res.ok) {
      continue;
    }
    const data = await res.json() as { content?: string; encoding?: string };
    if (data.encoding === "base64" && data.content) {
      return atob(data.content.replace(/\n/g, ""));
    }
  }

  return null;
}

async function fetchGitLabCodeowners(mrData: MRData, token?: string): Promise<string | null> {
  const parsed = parseGitLabUrl(mrData.pr.url);
  if (!parsed) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  for (const candidatePath of CODEOWNERS_CANDIDATE_PATHS) {
    const encodedPath = encodeURIComponent(parsed.projectPath);
    const encodedFile = encodeURIComponent(candidatePath);
    const ref = encodeURIComponent(mrData.pr.headBranch);
    const res = await fetch(`/api/gitlab/api/v4/projects/${encodedPath}/repository/files/${encodedFile}/raw?ref=${ref}`, { headers });
    if (res.ok) {
      return res.text();
    }
  }

  return null;
}

async function fetchReviewerSuggestions(mrData: MRData, token?: string): Promise<CodeReview["reviewerSuggestions"]> {
  const cacheKey = `${mrData.platform}:${mrData.pr.url}:${mrData.pr.headBranch}`;
  const cached = reviewerSuggestionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const codeownersContent = mrData.platform === "github"
        ? await fetchGitHubCodeowners(mrData, token)
        : await fetchGitLabCodeowners(mrData, token);

      if (!codeownersContent) {
        return [];
      }

      const rules = parseCodeowners(codeownersContent);
      return buildReviewerSuggestions(mrData.files, rules);
    } catch {
      return [];
    }
  })();

  reviewerSuggestionCache.set(cacheKey, promise);
  return promise;
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

    return callOpenRouter<ChangeSummary>(aiConfig.apiKey, getModelForTask(aiConfig, "summary"), [
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

    return callOpenRouter<ExecutionFlow>(aiConfig.apiKey, getModelForTask(aiConfig, "flow"), [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], FLOW_SCHEMA);
}

export async function analyzeCodeReview(mrData: MRData, aiConfig: AIConfig, token?: string): Promise<CodeReview> {
  const hydrated = await prepareMRDataForReview(mrData, aiConfig, token);
  const { pr, files } = hydrated;
  const reviewMode = aiConfig.reviewMode ?? "deep";
  const diffContent = buildContextAwareDiff(files, reviewMode);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const hasFullContent = files.some((f) => f.fullContent);
  const systemPrompt = `You are a very senior software engineer (10+ years) performing a ${reviewMode === "quick" ? "fast, high-signal" : "thorough, context-aware"} code review.

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
Always return valid JSON. For optional string fields (file, lineHint, currentCode, impact) always provide a string value (use "" if not applicable).
For each issue:
- set confidence to low, medium, or high based on how strongly the evidence supports the finding
- set rationale to 1-2 sentences explaining why the finding matters in this specific PR
- set fixable to true when a concrete code-level fix can be proposed from the provided context${
  aiConfig.repoMemory?.trim()
    ? "\n- treat REPOSITORY REVIEW MEMORY as high-priority context about intentional patterns, business rules, and what should or should not be flagged for this repo"
    : ""
}${
  reviewMode === "quick"
    ? "\n- in quick mode, prioritize only high-confidence critical and warning issues unless a suggestion is unusually important"
    : ""
}${
  aiConfig.customRules?.trim()
    ? `\n\nADDITIONAL REVIEWER RULES (from the team — follow these strictly):\n${aiConfig.customRules.trim()}`
    : ""
}`;

  const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description"}
Author: ${pr.author}
Branch: ${pr.headBranch} → ${pr.baseBranch}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}

${aiConfig.repoMemory?.trim()
  ? `REPOSITORY REVIEW MEMORY:
${aiConfig.repoMemory.trim()}

`
  : ""}${aiConfig.customRules?.trim()
  ? `TEAM REVIEW RULES:
${aiConfig.customRules.trim()}

`
  : ""}FILE CONTEXT + DIFFS:
${diffContent}

Perform a comprehensive senior-level code review using the full file context above.`;

  const review = await callOpenRouter<CodeReview>(aiConfig.apiKey, getModelForTask(aiConfig, "review"), [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], REVIEW_SCHEMA);

  // Normalise score: some models return 0–100 even when instructed otherwise
  if (review.overallScore > 10) {
    review.overallScore = Math.round((review.overallScore / 10) * 10) / 10;
  }

  review.testGapSummary = computeTestGapSummary(files);
  review.riskHotspots = computeRiskHotspots(files, review.issues, review.testGapSummary);
  review.reviewerSuggestions = [];

  return review;
}

// ─── Issue fetching ──────────────────────────────────────────────────────────

export interface IssueData {
  title: string;
  description: string;
  labels: string[];
  url: string;
}

export function parseGitLabIssueUrl(url: string): { projectPath: string; issueIid: string } | null {
  const match = url.match(/gitlab\.com\/(.+?)\/-\/(?:issues|work_items)\/(\d+)/);
  if (match) return { projectPath: match[1], issueIid: match[2] };
  return null;
}

export function parseGitHubIssueUrl(url: string): { owner: string; repo: string; number: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (match) return { owner: match[1], repo: match[2], number: match[3] };
  return null;
}

export async function fetchIssueData(url: string, token?: string): Promise<IssueData> {
  const gitlab = parseGitLabIssueUrl(url);
  if (gitlab) {
    const encodedPath = encodeURIComponent(gitlab.projectPath);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["PRIVATE-TOKEN"] = token;

    const res = await fetch(`/api/gitlab/api/v4/projects/${encodedPath}/issues/${gitlab.issueIid}`, { headers });
    if (!res.ok) throw new Error(`GitLab issue fetch failed: ${res.status}`);
    const data = await res.json();
    return {
      title: data.title,
      description: data.description ?? "",
      labels: data.labels ?? [],
      url,
    };
  }

  const github = parseGitHubIssueUrl(url);
  if (github) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}/issues/${github.number}`, { headers });
    if (!res.ok) throw new Error(`GitHub issue fetch failed: ${res.status}`);
    const data = await res.json();
    return {
      title: data.title,
      description: data.body ?? "",
      labels: (data.labels ?? []).map((l: { name: string }) => l.name),
      url,
    };
  }

  throw new Error("Invalid issue URL. Provide a GitHub or GitLab issue link.");
}

// ─── Requirements check ─────────────────────────────────────────────────────

const REQUIREMENTS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    issueTitle: { type: "string" },
    issueSummary: { type: "string" },
    overallCoverage: { type: "string", enum: ["fully_covered", "mostly_covered", "partially_covered", "poorly_covered"] },
    coverageScore: { type: "number" },
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          status: { type: "string", enum: ["fulfilled", "partially_fulfilled", "not_fulfilled", "not_applicable"] },
          evidence: { type: "string" },
          notes: { type: "string" },
        },
        required: ["requirement", "status", "evidence", "notes"],
        additionalProperties: false,
      },
    },
    missingItems: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["issueTitle", "issueSummary", "overallCoverage", "coverageScore", "requirements", "missingItems", "suggestions"],
  additionalProperties: false,
};

export async function analyzeRequirements(
  mrData: MRData,
  issue: IssueData,
  aiConfig: AIConfig
): Promise<RequirementsCheck> {
  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required.");

  const diffContent = buildDiffContent(mrData.files);

  const systemPrompt = `You are a senior QA engineer and project manager. Your task is to compare a merge request against the linked issue/task requirements and determine if ALL requirements are fulfilled by the code changes.

Extract every requirement, acceptance criterion, and deliverable from the issue description. For each one, check the code diff to determine if it's been implemented.

Be thorough: check edge cases, error handling, UI requirements, API contracts, and testing requirements mentioned in the issue.
coverageScore must be a number between 0 and 100.
Always return valid JSON.`;

  const userPrompt = `ISSUE TITLE: ${issue.title}
ISSUE DESCRIPTION:
${issue.description || "No description"}
ISSUE LABELS: ${issue.labels.join(", ") || "None"}

MR TITLE: ${mrData.pr.title}
MR DESCRIPTION: ${mrData.pr.description || "No description"}
Branch: ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}
Stats: ${mrData.pr.changedFiles} files changed, +${mrData.pr.additions}/-${mrData.pr.deletions}

FILE DIFFS:
${diffContent}

Extract ALL requirements from the issue and check each one against the code changes. Be specific about what evidence you found (or didn't find) in the diff.`;

  const result = await callOpenRouter<RequirementsCheck>(aiConfig.apiKey, getModelForTask(aiConfig, "requirements"), [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], REQUIREMENTS_SCHEMA);

  if (result.coverageScore > 100) result.coverageScore = 100;
  return result;
}

// ─── MR description review ──────────────────────────────────────────────────

const MR_DESCRIPTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    currentQuality: { type: "string", enum: ["excellent", "good", "needs_improvement", "poor"] },
    qualityScore: { type: "number" },
    strengths: { type: "array", items: { type: "string" } },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          suggestion: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          example: { type: "string" },
        },
        required: ["category", "suggestion", "priority", "example"],
        additionalProperties: false,
      },
    },
    suggestedDescription: { type: "string" },
  },
  required: ["currentQuality", "qualityScore", "strengths", "suggestions", "suggestedDescription"],
  additionalProperties: false,
};

export async function analyzeMRDescription(
  mrData: MRData,
  aiConfig: AIConfig,
  issue?: IssueData | null
): Promise<MRDescriptionReview> {
  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required.");

  const diffContent = buildDiffContent(mrData.files);

  const systemPrompt = `You are a senior engineering manager reviewing a merge request description. Evaluate the MR description quality and suggest improvements.

A good MR description should include:
- Clear summary of what changed and why
- Link to related issue/ticket (if applicable)
- How to test the changes
- Screenshots/recordings for UI changes
- Breaking changes or migration steps
- Checklist of completed items
- Impact on other systems/services

qualityScore must be a number between 0 and 100.
For suggestedDescription, write a complete improved MR description in markdown that the author could copy-paste.
Always return valid JSON.`;

  const userPrompt = `MR TITLE: ${mrData.pr.title}
MR DESCRIPTION:
${mrData.pr.description || "(empty — no description provided)"}
Author: ${mrData.pr.author}
Branch: ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}
Stats: ${mrData.pr.changedFiles} files changed, +${mrData.pr.additions}/-${mrData.pr.deletions}, ${mrData.pr.commits} commit(s)
${issue ? `\nLINKED ISSUE: ${issue.title}\n${issue.description}\n` : ""}
FILE DIFFS (so you know what changed):
${diffContent}

Review the MR description and suggest what should be added or improved. Generate a complete improved description.`;

  const result = await callOpenRouter<MRDescriptionReview>(aiConfig.apiKey, getModelForTask(aiConfig, "mr-description"), [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], MR_DESCRIPTION_SCHEMA);

  if (result.qualityScore > 100) result.qualityScore = 100;
  return result;
}

export async function askReviewQuestion(
  mrData: MRData,
  aiConfig: AIConfig,
  question: string,
  token?: string,
): Promise<string> {
  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required.");

  const context = buildContextAwareDiff(mrData.files, "quick");

  return callOpenRouterText(aiConfig.apiKey, getModelForTask(aiConfig, "chat"), [
    {
      role: "system",
      content: "You are a senior engineer answering focused questions about a pull or merge request. Be precise, grounded in the provided diff and file context, and say when the answer is uncertain.",
    },
    {
      role: "user",
      content: `PR Title: ${mrData.pr.title}
PR Description: ${mrData.pr.description || "No description"}
Branch: ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}

FILE CONTEXT + DIFFS:
${context}

Question: ${question}`,
    },
  ]);
}

export async function generateIssueFix(
  mrData: MRData,
  issue: Pick<CodeReview["issues"][number], "title" | "description" | "file" | "lineHint" | "currentCode" | "suggestedFix" | "rationale">,
  aiConfig: AIConfig,
  token?: string,
): Promise<string> {
  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required.");

  const hydrated = issue.file
    ? await hydrateFilesForReview(mrData, [issue.file], token)
    : mrData;
  const context = getRelevantFileContext(hydrated, issue.file, "deep");

  return callOpenRouterText(aiConfig.apiKey, getModelForTask(aiConfig, "fix"), [
    {
      role: "system",
      content: "You are a senior engineer generating a concrete fix suggestion for a review issue. Return only the proposed code or patch-style snippet with a short introductory sentence if needed.",
    },
    {
      role: "user",
      content: `Issue title: ${issue.title}
Issue description: ${issue.description}
Issue rationale: ${issue.rationale}
File: ${issue.file ?? "Unknown"}
Line hint: ${issue.lineHint ?? "Unknown"}
Current code:
${issue.currentCode || "(not provided)"}

Existing suggested fix:
${issue.suggestedFix || "(not provided)"}

Relevant file context:
${context}`,
    },
  ]);
}
