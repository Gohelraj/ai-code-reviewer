import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
  blob_url?: string;
}

interface GitHubPR {
  title: string;
  body: string;
  base: { ref: string; sha: string; label: string };
  head: { ref: string; sha: string; label: string };
  user: { login: string };
  created_at: string;
  updated_at: string;
  state: string;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
}

function parseGitHubUrl(url: string): { owner: string; repo: string; prNumber: string } | null {
  // https://github.com/owner/repo/pull/123
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) return { owner: match[1], repo: match[2], prNumber: match[3] };
  return null;
}

function parseGitLabUrl(url: string): { projectPath: string; mrIid: string } | null {
  // https://gitlab.com/owner/repo/-/merge_requests/123
  const match = url.match(/gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (match) return { projectPath: match[1], mrIid: match[2] };
  return null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID");
    const secretKey = Deno.env.get("BLINK_SECRET_KEY");

    if (!projectId || !secretKey) {
      return new Response(
        JSON.stringify({ error: "Missing server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { url, githubToken } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try GitHub first
    const githubParsed = parseGitHubUrl(url);
    if (githubParsed) {
      const { owner, repo, prNumber } = githubParsed;
      const headers: Record<string, string> = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MergeAI-Reviewer/1.0",
      };
      if (githubToken) {
        headers["Authorization"] = `Bearer ${githubToken}`;
      }

      // Fetch PR metadata
      const prRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        { headers }
      );

      if (!prRes.ok) {
        const errBody = await prRes.text();
        if (prRes.status === 401 || prRes.status === 403) {
          return new Response(
            JSON.stringify({ error: "GitHub authentication required. Please provide a personal access token for private repositories." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (prRes.status === 404) {
          return new Response(
            JSON.stringify({ error: "Pull request not found. Check the URL and ensure the repository is accessible." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `GitHub API error: ${prRes.status} ${errBody}` }),
          { status: prRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pr: GitHubPR = await prRes.json();

      // Fetch PR files (diff)
      const filesRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
        { headers }
      );

      if (!filesRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch PR files: ${filesRes.status}` }),
          { status: filesRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const files: GitHubFile[] = await filesRes.json();

      // Build structured diff
      const fileDiffs = files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch ?? null,
        blobUrl: f.blob_url ?? null,
      }));

      return new Response(
        JSON.stringify({
          platform: "github",
          pr: {
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
          },
          files: fileDiffs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try GitLab
    const gitlabParsed = parseGitLabUrl(url);
    if (gitlabParsed) {
      const { projectPath, mrIid } = gitlabParsed;
      const encodedPath = encodeURIComponent(projectPath);
      const glHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (githubToken) {
        glHeaders["PRIVATE-TOKEN"] = githubToken;
      }

      const mrRes = await fetchWithTimeout(
        `https://gitlab.com/api/v4/projects/${encodedPath}/merge_requests/${mrIid}`,
        { headers: glHeaders }
      );

      if (!mrRes.ok) {
        return new Response(
          JSON.stringify({ error: `GitLab API error: ${mrRes.status}` }),
          { status: mrRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const mr = await mrRes.json();

      // Fetch changes
      const changesRes = await fetchWithTimeout(
        `https://gitlab.com/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/changes`,
        { headers: glHeaders }
      );

      if (!changesRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch MR changes: ${changesRes.status}` }),
          { status: changesRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const changesData = await changesRes.json();
      const files = (changesData.changes ?? []).map((c: { new_path: string; diff?: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean; additions?: number; deletions?: number }) => ({
        filename: c.new_path,
        status: c.new_file ? "added" : c.deleted_file ? "removed" : c.renamed_file ? "renamed" : "modified",
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
        changes: (c.additions ?? 0) + (c.deletions ?? 0),
        patch: c.diff ?? null,
        blobUrl: null,
      }));

      return new Response(
        JSON.stringify({
          platform: "gitlab",
          pr: {
            title: mr.title,
            description: mr.description ?? "",
            baseBranch: mr.target_branch,
            headBranch: mr.source_branch,
            author: mr.author?.username ?? "unknown",
            state: mr.state,
            additions: changesData.changes?.reduce((sum: number, c: { additions?: number }) => sum + (c.additions ?? 0), 0) ?? 0,
            deletions: changesData.changes?.reduce((sum: number, c: { deletions?: number }) => sum + (c.deletions ?? 0), 0) ?? 0,
            changedFiles: files.length,
            commits: mr.commits_count ?? 0,
            createdAt: mr.created_at,
            url,
          },
          files,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid URL. Please provide a GitHub Pull Request or GitLab Merge Request URL." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-mr-diff:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

Deno.serve(handler);
