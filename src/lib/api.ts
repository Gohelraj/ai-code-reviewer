import type { MRData, ChangeSummary, ExecutionFlow, CodeReview, RequirementsCheck, MRDescriptionReview, FileDiff, PRInfo, RepoReviewMemory, ReviewContextInsight, ReviewIssue } from "../types";
import { DEFAULT_PRIMARY_MODEL, normalizeOpenRouterModel } from "../components/AISettings";
import type { AIConfig, ReviewMode } from "../components/AISettings";
import { buildStructuredContext, buildStructuredContextText } from "../core/context/contextBuilder";
import { analyzeImpact, buildImpactAnalysisText } from "../core/context/impactAnalyzer";
import { buildRuntimeSignalsText, detectRuntimeSignals } from "../core/context/runtimeChecks";
import { buildFunctionIndex, findFunctionDefinition } from "../core/context/functionIndex";
import { computeRiskHotspots, computeTestGapSummary, getReviewContextPlan, isProductionCodeFile } from "./review-utils";
import { formatRepoReviewMemory, hasRepoReviewMemory, parseRepoReviewMemory, summarizeRepoReviewMemory } from "./repo-memory";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

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
    projectId: mr.project_id ?? mr.target_project_id ?? mr.source_project_id,
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
          verificationStatus: { type: "string", enum: ["verified", "uncertain"] },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["diff", "full_file", "related_file", "repo_memory", "test", "contract"] },
                summary: { type: "string" },
                file: { type: "string" },
                lineHint: { type: "string" },
                snippet: { type: "string" },
              },
              required: ["type", "summary", "file", "lineHint", "snippet"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "severity", "category", "title", "description", "confidence", "rationale", "file", "lineHint", "currentCode", "suggestedFix", "impact", "fixable", "verificationStatus", "evidence"],
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
    contextInsights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          reason: { type: "string" },
          source: { type: "string", enum: ["import", "test", "sibling", "symbol", "contract"] },
          excerpt: { type: "string" },
        },
        required: ["file", "reason", "source", "excerpt"],
        additionalProperties: false,
      },
    },
    verificationSummary: { type: "string" },
    mergeReadiness: { type: "string" },
  },
  required: ["overallVerdict", "overallScore", "executiveSummary", "strengths", "issues", "architectureObservations", "securityConsiderations", "performanceConsiderations", "testingAssessment", "testGapSummary", "riskHotspots", "contextInsights", "verificationSummary", "mergeReadiness"],
  additionalProperties: false,
};

const REVIEW_VERIFICATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verificationSummary: { type: "string" },
    issues: REVIEW_SCHEMA.properties && typeof REVIEW_SCHEMA.properties === "object"
      ? (REVIEW_SCHEMA.properties as Record<string, unknown>).issues
      : { type: "array", items: { type: "object" } },
  },
  required: ["verificationSummary", "issues"],
  additionalProperties: false,
};

const REPO_MEMORY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    purpose: { type: "array", items: { type: "string" } },
    architecture: { type: "array", items: { type: "string" } },
    domainRules: { type: "array", items: { type: "string" } },
    reviewPriorities: { type: "array", items: { type: "string" } },
    intentionalPatterns: { type: "array", items: { type: "string" } },
    avoidFlagging: { type: "array", items: { type: "string" } },
  },
  required: ["purpose", "architecture", "domainRules", "reviewPriorities", "intentionalPatterns", "avoidFlagging"],
  additionalProperties: false,
};

const REPO_CONTEXT_FILE_SELECTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    paths: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["paths"],
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
export function buildContextAwareDiff(files: FileDiff[], reviewMode: ReviewMode = "deep", baseContentMap?: Map<string, string>): string {
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

    const baseContent = baseContentMap?.get(f.filename);
    if (baseContent && f.status === "modified") {
      const base = baseContent.slice(0, Math.floor(plan.perFileFullChars * 0.6));
      sections.push(`\nBASE FILE (state before this PR's changes):\n\`\`\`\n${base}\n\`\`\``);
    }

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

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

function getDirectory(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinPath(baseDir: string, path: string): string {
  return normalizePath(baseDir ? `${baseDir}/${path}` : path);
}

function resolveRelativeImportCandidates(fromFile: string, importPath: string): string[] {
  if (!importPath.startsWith(".")) {
    return [];
  }

  const baseDir = getDirectory(fromFile);
  const baseTarget = joinPath(baseDir, importPath);
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json", ".py", ".go", ".java", ".rb"];

  const candidates = extensions.map((extension) => `${baseTarget}${extension}`);
  return dedupe([
    ...candidates,
    ...extensions.filter(Boolean).map((extension) => `${baseTarget}/index${extension}`),
  ]);
}

async function extractCodeIntelligence(filePath: string, content: string): Promise<{
  imports: string[];
  symbols: string[];
}> {
  const { parseFile: parseAstFile } = await import("../core/ast/languageAdapter");
  const parsed = await parseAstFile(filePath, content);
  const symbols = dedupe([
    ...parsed.functions.map((fn) => fn.name),
    ...parsed.classes.map((cls) => cls.name),
    ...parsed.methods.map((method) => method.name),
    ...parsed.calls,
  ])
    .filter((symbol) => symbol.length > 2 && !["const", "return", "throw", "import", "export"].includes(symbol))
    .slice(0, 10);

  return {
    imports: parsed.imports.filter((entry) => entry.startsWith(".")),
    symbols,
  };
}

function findSnippetAroundSymbol(content: string, symbols: string[], fallbackLines = 18): string {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return "";

  for (const symbol of symbols) {
    const index = lines.findIndex((line) => line.includes(symbol));
    if (index !== -1) {
      const start = Math.max(0, index - 6);
      const end = Math.min(lines.length, index + 8);
      return lines.slice(start, end).join("\n");
    }
  }

  return lines.slice(0, Math.min(lines.length, fallbackLines)).join("\n");
}

function guessRelatedTestPaths(filename: string): string[] {
  if (/(^|\/)(__tests__|tests?|specs?)(\/|$)|(\.|-)(test|spec)\.[^.]+$/i.test(filename)) {
    return [];
  }

  const dir = getDirectory(filename);
  const baseName = stripExtension(filename.split("/").pop() ?? filename);
  const ext = filename.match(/(\.[^.]+)$/)?.[1] ?? ".ts";

  return dedupe([
    joinPath(dir, `${baseName}.test${ext}`),
    joinPath(dir, `${baseName}.spec${ext}`),
    joinPath(dir, `__tests__/${baseName}.test${ext}`),
    joinPath(dir, `__tests__/${baseName}.spec${ext}`),
    joinPath(dir, `tests/${baseName}.test${ext}`),
  ]);
}

function guessContractPaths(filename: string): string[] {
  const dir = getDirectory(filename);
  const baseName = stripExtension(filename.split("/").pop() ?? filename);
  return dedupe([
    joinPath(dir, "types.ts"),
    joinPath(dir, "schema.ts"),
    joinPath(dir, `${baseName}.types.ts`),
    joinPath(dir, `${baseName}.schema.ts`),
  ]);
}

async function fetchRepositoryFileContent(mrData: MRData, path: string, token?: string, refOverride?: string): Promise<string | null> {
  if (mrData.platform === "github") {
    const parsed = parseGitHubUrl(mrData.pr.url);
    if (!parsed) return null;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-Code-Reviewer/1.0",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const ref = encodeURIComponent(refOverride ?? mrData.pr.headBranch);
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}?ref=${ref}`, { headers });
    if (!res.ok) return null;
    const data = await res.json() as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    return atob(data.content.replace(/\n/g, ""));
  }

  const parsed = parseGitLabUrl(mrData.pr.url);
  if (!parsed) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  const encodedProject = encodeURIComponent(parsed.projectPath);
  const encodedFile = encodeURIComponent(path);
  const ref = encodeURIComponent(refOverride ?? mrData.pr.headBranch);
  const res = await fetch(`/api/gitlab/api/v4/projects/${encodedProject}/repository/files/${encodedFile}/raw?ref=${ref}`, { headers });
  if (!res.ok) return null;
  return res.text();
}

function mergeHydratedFile(mrData: MRData, filename: string, content: string | null): MRData {
  if (!content) {
    return mrData;
  }

  const existing = mrData.files.find((file) => file.filename === filename);
  if (existing) {
    return {
      ...mrData,
      files: mrData.files.map((file) => file.filename === filename ? { ...file, fullContent: file.fullContent ?? content } : file),
    };
  }

  return {
    ...mrData,
    files: [
      ...mrData.files,
      {
        filename,
        status: "context",
        additions: 0,
        deletions: 0,
        changes: 0,
        patch: null,
        blobUrl: null,
        fullContent: content,
      },
    ],
  };
}

interface ExistingComment {
  author: string;
  body: string;
  path?: string;
}

async function fetchExistingPRComments(mrData: MRData, token?: string): Promise<ExistingComment[]> {
  try {
    if (mrData.platform === "github") {
      const parsed = parseGitHubUrl(mrData.pr.url);
      if (!parsed) return [];
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Code-Reviewer/1.0",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const { owner, repo, prNumber } = parsed;
      const [reviewRes, generalRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=20`, { headers }),
      ]);
      const comments: ExistingComment[] = [];
      if (reviewRes.ok) {
        type GHReviewComment = { user: { login: string }; body: string; path?: string };
        const data = await reviewRes.json() as GHReviewComment[];
        comments.push(...data.map((c) => ({ author: c.user.login, body: c.body, path: c.path })));
      }
      if (generalRes.ok) {
        type GHComment = { user: { login: string }; body: string };
        const data = await generalRes.json() as GHComment[];
        comments.push(...data.map((c) => ({ author: c.user.login, body: c.body })));
      }
      return comments.slice(0, 60);
    }

    const parsed = parseGitLabUrl(mrData.pr.url);
    if (!parsed || !mrData.projectId) return [];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["PRIVATE-TOKEN"] = token;
    const encodedProjectId = encodeURIComponent(String(mrData.projectId));
    const res = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}/merge_requests/${parsed.mrIid}/notes?per_page=50`, { headers });
    if (!res.ok) return [];
    type GLNote = { author: { username: string }; body: string; position?: { new_path?: string }; system?: boolean };
    const notes = await res.json() as GLNote[];
    return notes
      .filter((n) => !n.system)
      .map((n) => ({ author: n.author.username, body: n.body, path: n.position?.new_path }))
      .slice(0, 60);
  } catch {
    return [];
  }
}

function buildExistingCommentsText(comments: ExistingComment[]): string {
  if (comments.length === 0) return "";
  return comments
    .map((c) => `- ${c.author}${c.path ? ` on \`${c.path}\`` : ""}: ${c.body.trim().slice(0, 300)}`)
    .join("\n");
}

/**
 * Fetches all blob paths in the repository at the head branch.
 * Used to validate heuristic file candidates before attempting to fetch them,
 * avoiding 404 API calls for files that don't exist.
 */
async function fetchRepoTreePaths(mrData: MRData, token?: string): Promise<string[]> {
  try {
    if (mrData.platform === "github") {
      const parsed = parseGitHubUrl(mrData.pr.url);
      if (!parsed) return [];
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Code-Reviewer/1.0",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const branchRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(mrData.pr.headBranch)}`,
        { headers },
      );
      if (!branchRes.ok) return [];
      const branch = await branchRes.json() as { commit?: { commit?: { tree?: { sha?: string } } } };
      const treeSha = branch.commit?.commit?.tree?.sha;
      if (!treeSha) return [];
      const treeRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${treeSha}?recursive=1`,
        { headers },
      );
      if (!treeRes.ok) return [];
      const tree = await treeRes.json() as { tree?: Array<{ path?: string; type?: string }> };
      return (tree.tree ?? [])
        .filter((e) => e.type === "blob" && !!e.path)
        .map((e) => e.path as string);
    }

    // GitLab
    if (!mrData.projectId) return [];
    const encodedProjectId = encodeURIComponent(String(mrData.projectId));
    const ref = encodeURIComponent(mrData.pr.headBranch);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["PRIVATE-TOKEN"] = token;
    const treeRes = await fetch(
      `/api/gitlab/api/v4/projects/${encodedProjectId}/repository/tree?recursive=true&per_page=100&ref=${ref}`,
      { headers },
    );
    if (!treeRes.ok) return [];
    const tree = await treeRes.json() as Array<{ path?: string; type?: string }>;
    return tree.filter((e) => e.type === "blob" && !!e.path).map((e) => e.path as string);
  } catch {
    return [];
  }
}

async function buildRelatedContextInsights(mrData: MRData, reviewMode: ReviewMode, token?: string): Promise<{
  hydrated: MRData;
  insights: ReviewContextInsight[];
}> {
  const plan = getReviewContextPlan(mrData.files, reviewMode);
  const selectedFiles = plan.selectedFiles
    .map((filename) => mrData.files.find((file) => file.filename === filename))
    .filter((file): file is FileDiff => !!file);

  const candidates = new Map<string, ReviewContextInsight>();
  let hydrated = mrData;

  for (const file of selectedFiles) {
    const sourceText = file.fullContent ?? "";
    const { symbols, imports } = sourceText
      ? await extractCodeIntelligence(file.filename, sourceText)
      : { symbols: [], imports: [] };

    for (const importPath of imports.flatMap((entry) => resolveRelativeImportCandidates(file.filename, entry)).slice(0, 6)) {
      candidates.set(importPath, {
        file: importPath,
        reason: `Imported by ${file.filename}`,
        source: "import",
        excerpt: "",
      });
    }

    for (const testPath of guessRelatedTestPaths(file.filename)) {
      candidates.set(testPath, {
        file: testPath,
        reason: `Likely related test for ${file.filename}`,
        source: "test",
        excerpt: "",
      });
    }

    for (const contractPath of guessContractPaths(file.filename)) {
      candidates.set(contractPath, {
        file: contractPath,
        reason: `Potential contract or type definition near ${file.filename}`,
        source: "contract",
        excerpt: "",
      });
    }

    const siblingFiles = mrData.files
      .filter((candidate) => candidate.filename !== file.filename && getDirectory(candidate.filename) === getDirectory(file.filename))
      .slice(0, 2);

    for (const sibling of siblingFiles) {
      candidates.set(sibling.filename, {
        file: sibling.filename,
        reason: `Sibling implementation near ${file.filename}`,
        source: "sibling",
        excerpt: findSnippetAroundSymbol(sibling.fullContent ?? sibling.patch ?? "", symbols),
      });
    }

    const symbolMatches = mrData.files
      .filter((candidate) => candidate.filename !== file.filename)
      .filter((candidate) => {
        const haystack = `${candidate.patch ?? ""}\n${candidate.fullContent ?? ""}`;
        return symbols.some((symbol) => haystack.includes(symbol));
      })
      .slice(0, 2);

    for (const match of symbolMatches) {
      candidates.set(match.filename, {
        file: match.filename,
        reason: `Mentions changed symbol(s) from ${file.filename}`,
        source: "symbol",
        excerpt: findSnippetAroundSymbol(match.fullContent ?? match.patch ?? "", symbols),
      });
    }
  }

  // Build a set of known repository paths to filter out heuristic candidates
  // (imports, tests, contracts) that don't exist, avoiding wasted 404 API calls.
  const treePaths = mrData.treePaths ?? (await fetchRepoTreePaths(mrData, token));
  const treeSet = treePaths.length > 0 ? new Set(treePaths) : null;
  if (treeSet) {
    for (const [path, insight] of candidates) {
      if (
        (insight.source === "import" || insight.source === "test" || insight.source === "contract") &&
        !treeSet.has(path)
      ) {
        candidates.delete(path);
      }
    }
  }
  // Propagate tree paths into hydrated so callers can reuse without a second fetch.
  hydrated = { ...hydrated, treePaths };

  // Identify which candidates need remote fetching vs those already available locally
  const candidateList = Array.from(candidates.values());
  const toFetch = candidateList.filter((candidate) => {
    const existing = hydrated.files.find((f) => f.filename === candidate.file);
    return !existing?.fullContent && !existing?.patch;
  });

  // Fetch all missing files in parallel (concurrency-limited to avoid rate limits)
  const fetchedPairs = await runWithConcurrency(
    toFetch.map((candidate) => async () => ({
      file: candidate.file,
      content: await fetchRepositoryFileContent(hydrated, candidate.file, token),
    })),
    6,
  );

  // Sequential merge to keep hydrated state consistent
  for (const { file, content } of fetchedPairs) {
    hydrated = mergeHydratedFile(hydrated, file, content);
  }

  // Build function index AFTER all files are merged for better call-graph coverage
  const functionIndex = await buildFunctionIndex(hydrated.files);

  // Run AST intelligence extraction for all candidates in parallel
  const insightResults = await Promise.all(
    candidateList.map(async (candidate) => {
      const existing = hydrated.files.find((f) => f.filename === candidate.file);
      const content = existing?.fullContent ?? existing?.patch ?? null;
      if (!content) return null;

      const parsedCandidate = await extractCodeIntelligence(candidate.file, content);
      const definitionMatch = parsedCandidate.symbols
        .map((symbol) => ({ symbol, definition: findFunctionDefinition(functionIndex, symbol) }))
        .find((match) => match.definition?.file === candidate.file);

      return {
        ...candidate,
        reason: definitionMatch
          ? `${candidate.reason}; defines ${definitionMatch.symbol}`
          : candidate.reason,
        excerpt: candidate.excerpt || definitionMatch?.definition?.body || findSnippetAroundSymbol(content, parsedCandidate.symbols),
      } as ReviewContextInsight;
    }),
  );

  const insights = insightResults.filter((i): i is ReviewContextInsight => i !== null);

  return {
    hydrated,
    insights: insights.slice(0, reviewMode === "quick" ? 8 : 16),
  };
}

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

async function planAdditionalReviewFiles(mrData: MRData, aiConfig: AIConfig, token?: string): Promise<MRData> {
  const treePaths = mrData.treePaths;
  if (!treePaths || treePaths.length === 0 || !aiConfig.apiKey) return mrData;

  const diffSummary = mrData.files
    .filter((f) => f.status !== "removed")
    .map((f) => `${f.filename} [${f.status}] +${f.additions}/-${f.deletions}`)
    .join("\n");

  const changedSet = new Set(mrData.files.map((f) => f.filename));
  const candidates = treePaths
    .filter((p) => !changedSet.has(p))
    .filter((p) => !/\.(lock|min\.js|map|snap|generated\.|d\.ts$)|node_modules\/|dist\/|build\/|\.cache\/|coverage\//.test(p))
    .sort((a, b) => scoreRepoContextPath(b) - scoreRepoContextPath(a))
    .slice(0, 80)
    .map((p) => `- ${p}`)
    .join("\n");

  if (!candidates) return mrData;

  try {
    const result = await callOpenRouter<{ paths: string[] }>(
      aiConfig.apiKey,
      getModelForTask(aiConfig, "summary"),
      [
        {
          role: "system",
          content: "You are selecting additional repository files to fetch as context for a thorough code review. Choose only files directly relevant to verifying the correctness, safety, or completeness of the listed changes. Prefer callers of changed functions, shared utilities, config files, auth/permission modules, or type definitions used by the changed code. Return at most 5 file paths.",
        },
        {
          role: "user",
          content: `PR: ${mrData.pr.title}\nBranch: ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}\n\nCHANGED FILES:\n${diffSummary}\n\nCANDIDATE FILES (not in PR):\n${candidates}\n\nWhich files would most help verify these changes?`,
        },
      ],
      REPO_CONTEXT_FILE_SELECTION_SCHEMA,
    );

    const validPaths = result.paths
      .filter((p) => treePaths.includes(p) && !changedSet.has(p))
      .slice(0, 5);

    if (validPaths.length === 0) return mrData;

    const fetchedContents = await Promise.all(
      validPaths.map(async (path) => ({
        path,
        content: await fetchRepositoryFileContent(mrData, path, token),
      })),
    );

    let updated = mrData;
    for (const { path, content } of fetchedContents) {
      if (content) updated = mergeHydratedFile(updated, path, content);
    }
    return updated;
  } catch {
    return mrData;
  }
}

async function fetchBaseVersionsForTopFiles(mrData: MRData, maxFiles: number, token?: string): Promise<Map<string, string>> {
  if (maxFiles === 0) return new Map();
  const topFiles = [...mrData.files]
    .filter((f) => f.status === "modified" && isProductionCodeFile(f.filename))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, maxFiles);

  const entries = await Promise.all(
    topFiles.map(async (file) => {
      const content = await fetchRepositoryFileContent(mrData, file.filename, token, mrData.pr.baseBranch);
      return content ? ([file.filename, content] as const) : null;
    }),
  );
  return new Map(entries.filter((e): e is [string, string] => e !== null));
}

export async function prepareMRDataForReview(mrData: MRData, aiConfig: AIConfig, token?: string): Promise<MRData> {
  const reviewMode = aiConfig.reviewMode ?? "deep";
  const plan = getReviewContextPlan(mrData.files, reviewMode);
  return hydrateFilesForReview(mrData, plan.fullContentFiles, token);
}

function getModelForTask(aiConfig: AIConfig, task: "summary" | "flow" | "review" | "verify" | "requirements" | "mr-description" | "chat" | "fix"): string {
  if (task === "review") {
    return normalizeOpenRouterModel(aiConfig.model, DEFAULT_PRIMARY_MODEL);
  }
  return normalizeOpenRouterModel(aiConfig.auxiliaryModel?.trim() || aiConfig.model, DEFAULT_PRIMARY_MODEL);
}

interface RepoContextSource {
  path: string;
  content: string;
}

interface RepoContextMetadata {
  repoLabel: string;
  branch: string;
  defaultBranch?: string;
  projectId?: number | string;
  topLevelEntries: string[];
  treePaths: string[];
  platform: "github" | "gitlab";
}

function truncateRepoContext(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n... [truncated]` : value;
}

function getTopLevelEntriesFromPaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.split("/")[0]).filter(Boolean))].slice(0, 30);
}

function scoreRepoContextPath(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;

  if (/^readme(\.|$)/.test(lower) || lower.endsWith("/readme.md")) score += 120;
  if (lower.includes("architecture")) score += 110;
  if (lower.includes("contributing")) score += 80;
  if (lower.startsWith("docs/")) score += 70;
  if (/(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle|dockerfile|docker-compose\.yml|tsconfig\.json|vite\.config|next\.config)/.test(lower)) score += 60;
  if (/(src\/main|src\/app|src\/index|cmd\/|main\.go|app\.py|manage\.py|server\.js|server\.ts|index\.ts|index\.js)/.test(lower)) score += 50;
  if (/(route|router|controller|service|repository|model|schema|middleware|config)/.test(lower)) score += 30;
  if (/\.(md|txt|json|ya?ml|toml|ts|tsx|js|jsx|py|go|rb|java|kt|rs)$/.test(lower)) score += 10;
  if (/(test|spec|mock|fixture|snapshot|dist|build|coverage|public\/|assets\/|node_modules\/|vendor\/)/.test(lower)) score -= 40;
  if (/(\.env|lock$|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)/.test(lower)) score -= 45;

  return score;
}

function buildRepoTreeCandidatePaths(treePaths: string[]): string[] {
  return [...treePaths]
    .sort((left, right) => {
      const scoreDiff = scoreRepoContextPath(right) - scoreRepoContextPath(left);
      if (scoreDiff !== 0) return scoreDiff;
      return left.localeCompare(right);
    })
    .slice(0, 120);
}

async function selectRepoContextPaths(treePaths: string[], metadata: RepoContextMetadata, aiConfig: AIConfig): Promise<string[]> {
  const candidates = buildRepoTreeCandidatePaths(treePaths);
  const treeListing = candidates.map((path) => `- ${path}`).join("\n");

  try {
    const selection = await callOpenRouter<{ paths: string[] }>(
      aiConfig.apiKey,
      getModelForTask(aiConfig, "summary"),
      [
        {
          role: "system",
          content: "Choose the most useful repository files for understanding repo purpose, architecture, domain rules, and review guidance. Prefer docs, config, and core entrypoints. Avoid tests, generated files, lockfiles, and env samples unless they are unusually important.",
        },
        {
          role: "user",
          content: `Repository: ${metadata.repoLabel}
Default branch: ${metadata.branch}
Top-level entries: ${metadata.topLevelEntries.join(", ") || "Unknown"}

Candidate repository files:
${treeListing}

Select up to 8 file paths that would best explain this repository to an AI code reviewer.`,
        },
      ],
      REPO_CONTEXT_FILE_SELECTION_SCHEMA,
    );

    const selected = selection.paths.filter((path) => candidates.includes(path)).slice(0, 8);
    if (selected.length > 0) return selected;
  } catch {
    // Fall through to heuristic selection.
  }

  return candidates.slice(0, 8);
}

async function fetchGitHubRepoMetadata(url: string, token?: string): Promise<RepoContextMetadata & { owner: string; repo: string }> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("Invalid GitHub Pull Request URL.");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Code-Reviewer/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers });

  if (!repoRes.ok) throw new Error(`Failed to fetch repository metadata: ${repoRes.status}`);
  const repo = await repoRes.json();
  const branchRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(repo.default_branch)}`, { headers });
  if (!branchRes.ok) throw new Error(`Failed to fetch default branch metadata: ${branchRes.status}`);
  const branch = await branchRes.json();
  const treeSha = branch.commit?.commit?.tree?.sha;
  if (!treeSha) throw new Error("Could not resolve the default branch tree for this repository.");
  const treeRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${treeSha}?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error(`Failed to fetch repository tree: ${treeRes.status}`);
  const tree = await treeRes.json() as { tree?: Array<{ path?: string; type?: string }> };
  const treePaths = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && !!entry.path)
    .map((entry) => entry.path as string)
    .slice(0, 500);

  return {
    platform: "github",
    owner: parsed.owner,
    repo: parsed.repo,
    repoLabel: `${parsed.owner}/${parsed.repo}`,
    defaultBranch: repo.default_branch,
    branch: repo.default_branch,
    topLevelEntries: getTopLevelEntriesFromPaths(treePaths),
    treePaths,
  };
}

async function fetchGitLabRepoMetadata(url: string, token?: string): Promise<RepoContextMetadata & { projectPath: string }> {
  const parsed = parseGitLabUrl(url);
  if (!parsed) throw new Error("Invalid GitLab Merge Request URL.");

  const encodedPath = encodeURIComponent(parsed.projectPath);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  const mrRes = await fetch(`/api/gitlab/api/v4/projects/${encodedPath}/merge_requests/${parsed.mrIid}`, { headers });
  if (!mrRes.ok) throw new Error(`Failed to fetch merge request metadata: ${mrRes.status}`);
  const mr = await mrRes.json();
  const projectId = mr.project_id ?? mr.target_project_id ?? mr.source_project_id;
  if (!projectId) throw new Error("GitLab merge request response did not include a project id.");

  const projectRes = await fetch(`/api/gitlab/api/v4/projects/${encodeURIComponent(String(projectId))}`, { headers });
  if (!projectRes.ok) throw new Error(`Failed to fetch repository metadata: ${projectRes.status}`);
  const project = await projectRes.json();
  const encodedProjectId = encodeURIComponent(String(project.id));
  const treeRes = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}/repository/tree?recursive=true&per_page=200`, { headers });
  const tree = treeRes.ok ? await treeRes.json() as Array<{ path?: string; type?: string }> : [];
  const treePaths = tree
    .filter((entry) => entry.type === "blob" && !!entry.path)
    .map((entry) => entry.path as string)
    .slice(0, 500);

  return {
    platform: "gitlab",
    projectPath: parsed.projectPath,
    projectId: project.id,
    repoLabel: parsed.projectPath,
    defaultBranch: project.default_branch,
    branch: project.default_branch,
    topLevelEntries: getTopLevelEntriesFromPaths(treePaths),
    treePaths,
  };
}

async function fetchGitHubRepoContextSources(url: string, aiConfig: AIConfig, token?: string): Promise<{ repoLabel: string; branch: string; topLevelEntries: string[]; sources: RepoContextSource[] }> {
  const metadata = await fetchGitHubRepoMetadata(url, token);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Code-Reviewer/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const selectedPaths = await selectRepoContextPaths(metadata.treePaths, metadata, aiConfig);

  const sources = (await Promise.all(selectedPaths.map(async (path) => {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const ref = encodeURIComponent(metadata.branch);
    const res = await fetch(`https://api.github.com/repos/${metadata.owner}/${metadata.repo}/contents/${encodedPath}?ref=${ref}`, { headers });
    if (!res.ok) return null;
    const data = await res.json() as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    return {
      path,
      content: truncateRepoContext(atob(data.content.replace(/\n/g, "")), 5000),
    } satisfies RepoContextSource;
  }))).filter((item): item is RepoContextSource => !!item);

  return {
    repoLabel: `${metadata.owner}/${metadata.repo}`,
    branch: metadata.defaultBranch,
    topLevelEntries: metadata.topLevelEntries,
    sources,
  };
}

async function fetchGitLabRepoContextSources(url: string, aiConfig: AIConfig, token?: string): Promise<{ repoLabel: string; branch: string; topLevelEntries: string[]; sources: RepoContextSource[] }> {
  const metadata = await fetchGitLabRepoMetadata(url, token);
  const encodedProjectId = encodeURIComponent(String(metadata.projectId));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;
  const selectedPaths = await selectRepoContextPaths(metadata.treePaths, metadata, aiConfig);

  const sources = (await Promise.all(selectedPaths.map(async (path) => {
    const encodedFile = encodeURIComponent(path);
    const ref = encodeURIComponent(metadata.branch);
    const res = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}/repository/files/${encodedFile}/raw?ref=${ref}`, { headers });
    if (!res.ok) return null;
    return {
      path,
      content: truncateRepoContext(await res.text(), 5000),
    } satisfies RepoContextSource;
  }))).filter((item): item is RepoContextSource => !!item);

  return {
    repoLabel: metadata.projectPath,
    branch: metadata.defaultBranch,
    topLevelEntries: metadata.topLevelEntries,
    sources,
  };
}

async function fetchGitLabRepoContextSourcesFromMRData(mrData: MRData, aiConfig: AIConfig, token?: string): Promise<{ repoLabel: string; branch: string; topLevelEntries: string[]; sources: RepoContextSource[] }> {
  if (mrData.platform !== "gitlab" || !mrData.projectId) {
    throw new Error("Loaded MR data does not include a GitLab project id.");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  const encodedProjectId = encodeURIComponent(String(mrData.projectId));
  const projectRes = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}`, { headers });
  if (!projectRes.ok) throw new Error(`Failed to fetch repository metadata: ${projectRes.status}`);
  const project = await projectRes.json();
  const treeRes = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}/repository/tree?recursive=true&per_page=200`, { headers });
  const tree = treeRes.ok ? await treeRes.json() as Array<{ path?: string; type?: string }> : [];
  const treePaths = tree
    .filter((entry) => entry.type === "blob" && !!entry.path)
    .map((entry) => entry.path as string)
    .slice(0, 500);
  const metadata: RepoContextMetadata = {
    platform: "gitlab",
    repoLabel: parseGitLabUrl(mrData.pr.url)?.projectPath ?? String(mrData.projectId),
    branch: project.default_branch,
    defaultBranch: project.default_branch,
    projectId: mrData.projectId,
    topLevelEntries: getTopLevelEntriesFromPaths(treePaths),
    treePaths,
  };
  const selectedPaths = await selectRepoContextPaths(treePaths, metadata, aiConfig);

  const sources = (await Promise.all(selectedPaths.map(async (path) => {
    const encodedFile = encodeURIComponent(path);
    const ref = encodeURIComponent(project.default_branch);
    const res = await fetch(`/api/gitlab/api/v4/projects/${encodedProjectId}/repository/files/${encodedFile}/raw?ref=${ref}`, { headers });
    if (!res.ok) return null;
    return {
      path,
      content: truncateRepoContext(await res.text(), 5000),
    } satisfies RepoContextSource;
  }))).filter((item): item is RepoContextSource => !!item);

  return {
    repoLabel: metadata.repoLabel,
    branch: project.default_branch,
    topLevelEntries: metadata.topLevelEntries,
    sources,
  };
}

export async function generateRepoContext(repoUrl: string, aiConfig: AIConfig, token?: string, mrData?: MRData | null): Promise<string> {
  if (!aiConfig.apiKey) {
    throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");
  }

  const repoContextData = mrData?.platform === "gitlab" && mrData.projectId
    ? await fetchGitLabRepoContextSourcesFromMRData(mrData, aiConfig, token)
    : parseGitHubUrl(repoUrl)
    ? await fetchGitHubRepoContextSources(repoUrl, aiConfig, token)
    : parseGitLabUrl(repoUrl)
    ? await fetchGitLabRepoContextSources(repoUrl, aiConfig, token)
    : null;

  if (!repoContextData) {
    throw new Error("Repo context generation currently supports GitHub PR URLs and GitLab MR URLs.");
  }

  if (repoContextData.sources.length === 0) {
    throw new Error("No high-signal repo files were found to generate context from.");
  }

  const sourcesText = repoContextData.sources
    .map((source) => `## ${source.path}\n${source.content}`)
    .join("\n\n");

  const prompt = `You are generating repository review memory for an AI code reviewer.

Repository: ${repoContextData.repoLabel}
Default branch: ${repoContextData.branch}
Top-level entries: ${repoContextData.topLevelEntries.join(", ") || "Unknown"}

Using the repository files below, draft concise but high-signal repo review memory that future code reviews should use.

Output requirements:
- Focus on stable repo context, not temporary implementation details
- Fill each section with short, reviewer-usable bullet points
- Include:
  - purpose
  - architecture
  - domainRules
  - reviewPriorities
  - intentionalPatterns
  - avoidFlagging
- Do not invent specifics that are not supported by the provided files
- Keep it compact and reviewer-oriented

Repository files:
${sourcesText}`;

  const memory = await callOpenRouter<RepoReviewMemory>(aiConfig.apiKey, getModelForTask(aiConfig, "summary"), [
    { role: "system", content: "You write concise, reliable repository review memory for future AI code reviews." },
    { role: "user", content: prompt },
  ], REPO_MEMORY_SCHEMA);

  return formatRepoReviewMemory(memory);
}

function buildRelatedContextText(insights: ReviewContextInsight[]): string {
  if (insights.length === 0) {
    return "No additional related repository context was retrieved.";
  }

  return insights
    .map((insight) => {
      const sourceLabel = insight.source.replace(/_/g, " ");
      const excerpt = insight.excerpt?.trim() ? `\nExcerpt:\n${insight.excerpt.trim()}` : "";
      return `### ${insight.file}\nSource: ${sourceLabel}\nReason: ${insight.reason}${excerpt}`;
    })
    .join("\n\n");
}

function normalizeReviewIssue(issue: ReviewIssue, index: number): ReviewIssue {
  return {
    ...issue,
    id: issue.id?.trim() || `issue-${index + 1}`,
    file: issue.file?.trim() || "",
    lineHint: issue.lineHint?.trim() || "",
    currentCode: issue.currentCode?.trim() || "",
    impact: issue.impact?.trim() || "",
    suggestedFix: issue.suggestedFix?.trim() || "",
    verificationStatus: issue.verificationStatus === "verified" ? "verified" : "uncertain",
    evidence: (issue.evidence ?? []).map((entry) => ({
      type: entry.type,
      summary: entry.summary?.trim() || "Supporting evidence was not summarised.",
      file: entry.file?.trim() || "",
      lineHint: entry.lineHint?.trim() || "",
      snippet: entry.snippet?.trim() || "",
    })),
  };
}

export async function analyzeSummary(mrData: MRData, aiConfig: AIConfig): Promise<ChangeSummary> {
  const { pr, files } = mrData;
  const diffContent = buildDiffContent(files);

  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const systemPrompt = `You are an expert software engineer reviewing a pull/merge request. Analyze the PR and produce a structured summary. Always return valid JSON matching the exact schema.\nKeep all text fields concise: short bullet points or 1-sentence values. Avoid prose paragraphs. No filler openers.`;
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
  if (!aiConfig.apiKey) throw new Error("OpenRouter API key is required. Please configure it in AI Settings.");

  const reviewMode = aiConfig.reviewMode ?? "deep";
  const repoMemory = parseRepoReviewMemory(aiConfig.repoMemory);
  const prepared = await prepareMRDataForReview(mrData, aiConfig, token);

  // Parallel: related context insights, existing PR comments, and base branch snapshots
  const baseFileCount = reviewMode === "quick" ? 0 : reviewMode === "max" ? 5 : 3;
  const [{ hydrated: hydratedRaw, insights }, existingComments, baseContentMap] = await Promise.all([
    buildRelatedContextInsights(prepared, reviewMode, token),
    fetchExistingPRComments(prepared, token),
    fetchBaseVersionsForTopFiles(prepared, baseFileCount, token),
  ]);

  // Agentic planning: AI selects additional files to fetch (skipped in quick mode)
  const hydrated = reviewMode !== "quick" ? await planAdditionalReviewFiles(hydratedRaw, aiConfig, token) : hydratedRaw;

  const { pr, files } = hydrated;
  const diffContent = buildContextAwareDiff(files, reviewMode, baseContentMap);
  const hasFullContent = files.some((f) => f.fullContent);
  const hasBaseContent = baseContentMap.size > 0;
  const relatedContextText = buildRelatedContextText(insights);
  const structuredContext = await buildStructuredContext(
    files.filter((file) => file.status !== "context"),
    files,
    insights,
  );
  const structuredContextText = buildStructuredContextText(structuredContext);
  const impact = analyzeImpact(
    files.filter((file) => file.status !== "context"),
    structuredContext,
  );
  const impactText = buildImpactAnalysisText(impact);
  const runtimeSignals = await detectRuntimeSignals(files);
  const runtimeSignalsText = buildRuntimeSignalsText(runtimeSignals);
  const structuredRepoMemory = hasRepoReviewMemory(repoMemory) ? formatRepoReviewMemory(repoMemory) : "";
  const repoMemorySummary = hasRepoReviewMemory(repoMemory) ? summarizeRepoReviewMemory(repoMemory) : "";

  const systemPrompt = `You are a very senior software engineer (10+ years) performing a ${reviewMode === "quick" ? "fast, high-signal" : "thorough, context-aware"} code review.

  For each changed file you receive:
  ${hasFullContent
    ? `1. ${hasBaseContent ? "BASE FILE — the complete state before this PR's changes (use it to understand what was deleted, replaced, or restructured)\n2. " : ""}FULL FILE — the complete current state of the file after this PR's changes, so you can see imports, types, existing patterns, and how all code fits together\n${hasBaseContent ? "3" : "2"}. DIFF — the exact lines added/removed`
  : "- DIFF — the exact lines added/removed (full file context unavailable for this repository)"}

Use the full file content (when present) to catch issues that only appear in context:
- Functions called with wrong arguments elsewhere in the same file
- Duplicate logic or existing helpers that should be reused  
- Violated naming/style conventions established in the file
- Type mismatches that span the full file scope
  - N+1 queries or missing eager-loads visible from the full model/query context
  - Security issues like hardcoded secrets, missing auth checks, injection vectors
  
  You also receive RELATED REPOSITORY CONTEXT pulled from nearby imports, sibling files, likely tests, and contract/type files. Use it to validate cross-file behavior and reduce false positives.
  You also receive STRUCTURED EXECUTION CONTEXT built from AST parsing, function definitions, and the call graph. Use it to reason about changed functions, direct callers, direct callees, imports, and nearby related files.
  You also receive IMPACT ANALYSIS and RUNTIME SIGNALS. Treat them as high-signal hints about change risk and production behavior, but validate them against the code before escalating a finding.
  Repository memory, when provided, describes stable architecture intent and known exceptions. Respect it over generic style preferences.

  Be precise: always provide the exact file path and line reference when flagging an issue.
  IMPORTANT: overallScore must be a decimal between 0.0 and 10.0 (e.g. 6.5, not 65).
  Always return valid JSON. For optional string fields (file, lineHint, currentCode, impact) always provide a string value (use "" if not applicable).

  OUTPUT STYLE — keep all text fields terse and scannable. No prose paragraphs:
  - rationale: 1 sentence — why this matters specifically in this PR
  - impact: 1 short phrase (e.g. "Crashes on null input", "Auth bypass risk", "Silently swallows errors")
  - suggestedFix: imperative action + minimal code snippet if helpful; no preamble
  - evidence[].summary: 1 sentence citing the relevant file/line
  - strengths / architectureNotes / securityPosture / performancePosture: bullet points only, ≤ 8 words per bullet
  - reviewDiff / testGapSummary: 1-3 bullets or 2 sentences max
  - verificationSummary: 2 sentences max — verified vs. uncertain
  - contextInsights[].reason: 1 sentence
  Avoid openers like "This change introduces…", "It is worth noting…", "Overall, the PR…"

  For each issue:
  - set confidence to low, medium, or high based on how strongly the evidence supports the finding
  - set rationale to 1 sentence explaining why the finding matters in this specific PR
  - detect cross-file bugs when a changed function's callers or callees suggest a broken contract
  - detect API misuse, especially wrong arguments, wrong return-value assumptions, or incompatible cross-file usage
  - detect async issues in JavaScript/TypeScript, including unawaited promises, async work inside loops, and missing error handling
  - detect Go concurrency risks when the code or surrounding context suggests goroutines, shared state, or unsafe coordination
  - set fixable to true when a concrete code-level fix can be proposed from the provided context${
    structuredRepoMemory
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
  }
  - use IMPACT ANALYSIS to calibrate risk and prioritization for review findings
  - use RUNTIME SIGNALS to look for production hazards, but do not overstate weak heuristic evidence
  - add verificationStatus as "verified" when the evidence is directly supported by the supplied code/context, otherwise "uncertain"
  - include evidence entries for each issue, using the most relevant sources from diff, full file, related files, tests, contracts, or repo memory
  - include contextInsights listing only the files that meaningfully influenced the review`;

  const userPrompt = `PR Title: ${pr.title}
  PR Description: ${pr.description || "No description"}
  Author: ${pr.author}
  Branch: ${pr.headBranch} → ${pr.baseBranch}
  Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}
  
  ${structuredRepoMemory
    ? `REPOSITORY REVIEW MEMORY:
  ${structuredRepoMemory}

  MEMORY SUMMARY:
  ${repoMemorySummary}
  
  `
    : ""}${aiConfig.customRules?.trim()
    ? `TEAM REVIEW RULES:
  ${aiConfig.customRules.trim()}
  
  `
    : ""}STRUCTURED EXECUTION CONTEXT:
  ${structuredContextText}
  
  IMPACT:
  ${impactText}
  
  RUNTIME SIGNALS:
  ${runtimeSignalsText}
  
  RELATED CONTEXT:
  ${relatedContextText}
  ${existingComments.length > 0
    ? `
  EXISTING REVIEW COMMENTS (${existingComments.length} already posted — avoid duplicating these, but build on or contradict them if the code evidence demands it):
  ${buildExistingCommentsText(existingComments)}
  `
    : ""}
  FILE CONTEXT + DIFFS:
  ${diffContent}
  
  Produce a senior-level review that catches cross-file regressions, contract drift, duplicated patterns, risky auth/config changes, and stale tests when the supplied context supports it.`;

  const candidateReview = await callOpenRouter<CodeReview>(aiConfig.apiKey, getModelForTask(aiConfig, "review"), [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], REVIEW_SCHEMA);

  const verification = await callOpenRouter<{ verificationSummary: string; issues: ReviewIssue[] }>(
    aiConfig.apiKey,
    getModelForTask(aiConfig, "verify"),
    [
      {
        role: "system",
        content: `You are verifying candidate code-review findings. Keep only findings supported by the supplied diff, full-file context, related repository context, and repo memory.
Return the same issues with corrected confidence, verificationStatus, rationale, and evidence.
If a finding may still be real but is not fully supported, mark it as uncertain instead of inventing certainty.
Keep all text fields terse: rationale ≤ 1 sentence, impact ≤ 1 phrase, evidence[].summary ≤ 1 sentence each.
verificationSummary: 2 sentences max — what was verified vs. what remains uncertain.
Always return valid JSON.`,
      },
      {
        role: "user",
        content: `CANDIDATE REVIEW FINDINGS:
${JSON.stringify(candidateReview.issues, null, 2)}

${structuredRepoMemory
  ? `REPOSITORY REVIEW MEMORY:
${structuredRepoMemory}

`
  : ""}RELATED CONTEXT:
${relatedContextText}

FILE CONTEXT + DIFFS:
${diffContent}

Verify the findings, correct any unsupported claims, and summarise how much of the review is directly grounded in code versus inferred from broader context.`,
      },
    ],
    REVIEW_VERIFICATION_SCHEMA,
  );

  const normalizedIssues = verification.issues.map((issue, index) => normalizeReviewIssue(issue, index));
  const testGapSummary = computeTestGapSummary(files);
  const review: CodeReview = {
    ...candidateReview,
    issues: normalizedIssues,
    contextInsights: insights.map((insight) => ({
      ...insight,
      excerpt: insight.excerpt ?? "",
    })),
    verificationSummary: verification.verificationSummary,
    testGapSummary,
    riskHotspots: computeRiskHotspots(files, normalizedIssues, testGapSummary),
  };

  if (review.overallScore > 10) {
    review.overallScore = Math.round((review.overallScore / 10) * 10) / 10;
  }

  if (review.overallScore < 0) {
    review.overallScore = 0;
  }

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
Always return valid JSON.
OUTPUT STYLE — keep all text fields terse:
- issueSummary: 1-2 sentences
- requirements[].evidence: 1 sentence citing specific file/line when possible
- requirements[].notes: 1 sentence, or "" if evidence is sufficient
- missingItems: short phrases, not full sentences
- suggestions: imperative phrases (e.g. "Add unit test for X"), 1 per item, no elaboration`;

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
Always return valid JSON.
OUTPUT STYLE — keep text fields terse:
- strengths: short bullet phrases (≤ 6 words each)
- suggestions[].suggestion: 1 imperative sentence
- suggestions[].example: a concrete snippet or short example only, no explanation prose
Avoid verbose explanations in strengths/suggestions.`;

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

  const reviewMode = aiConfig.reviewMode ?? "quick";
  const repoMemory = parseRepoReviewMemory(aiConfig.repoMemory);
  const prepared = await prepareMRDataForReview(mrData, { ...aiConfig, reviewMode }, token);
  const { hydrated, insights } = await buildRelatedContextInsights(prepared, "quick", token);
  const context = buildContextAwareDiff(hydrated.files, "quick");
  const relatedContextText = buildRelatedContextText(insights);
  const structuredRepoMemory = hasRepoReviewMemory(repoMemory) ? formatRepoReviewMemory(repoMemory) : "";

  return callOpenRouterText(aiConfig.apiKey, getModelForTask(aiConfig, "chat"), [
    {
      role: "system",
      content: "You are a senior engineer answering focused questions about a pull or merge request. Be precise, grounded in the provided diff, full-file context, related repository context, and repo memory. Say explicitly when the answer is uncertain.",
    },
    {
      role: "user",
      content: `PR Title: ${mrData.pr.title}
PR Description: ${mrData.pr.description || "No description"}
Branch: ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}

${structuredRepoMemory ? `REPOSITORY REVIEW MEMORY:
${structuredRepoMemory}

` : ""}RELATED CONTEXT:
${relatedContextText}

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

  const repoMemory = parseRepoReviewMemory(aiConfig.repoMemory);
  const hydrated = issue.file
    ? await hydrateFilesForReview(mrData, [issue.file], token)
    : mrData;
  const { hydrated: enriched, insights } = await buildRelatedContextInsights(hydrated, "deep", token);
  const context = getRelevantFileContext(enriched, issue.file, "deep");
  const relatedContextText = buildRelatedContextText(
    insights.filter((insight) => !issue.file || insight.file === issue.file || insight.reason.includes(issue.file)).slice(0, 6),
  );
  const structuredRepoMemory = hasRepoReviewMemory(repoMemory) ? formatRepoReviewMemory(repoMemory) : "";

  return callOpenRouterText(aiConfig.apiKey, getModelForTask(aiConfig, "fix"), [
    {
      role: "system",
      content: "You are a senior engineer generating a concrete fix suggestion for a review issue. Use the current file context, related repository context, and repo memory to match existing patterns. Return only the proposed code or patch-style snippet with a short introductory sentence if needed.",
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

${structuredRepoMemory ? `REPOSITORY REVIEW MEMORY:
${structuredRepoMemory}

` : ""}RELATED CONTEXT:
${relatedContextText}

Relevant file context:
${context}`,
    },
  ]);
}
