interface PostCommentOptions {
  url: string;
  token: string;
  body: string;
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
