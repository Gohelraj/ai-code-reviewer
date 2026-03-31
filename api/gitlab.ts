import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the GitLab path from the full URL: /api/gitlab/api/v4/... → api/v4/...
  const prefix = "/api/gitlab/";
  const fullPath = req.url ?? "";
  const idx = fullPath.indexOf(prefix);
  if (idx === -1) return res.status(400).json({ error: "Invalid request path" });

  const gitlabPath = fullPath.slice(idx + prefix.length);
  if (!gitlabPath) return res.status(400).json({ error: "Missing GitLab path" });

  const targetUrl = `https://gitlab.com/${gitlabPath}`;

  // Forward relevant headers
  const headers: Record<string, string> = {};
  const privateToken = req.headers["private-token"];
  if (privateToken) headers["PRIVATE-TOKEN"] = String(privateToken);
  if (req.headers["content-type"]) headers["Content-Type"] = String(req.headers["content-type"]);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body) : undefined,
  });

  // Forward status and content-type
  const contentType = response.headers.get("content-type") || "application/json";
  res.status(response.status);
  res.setHeader("Content-Type", contentType);

  const data = await response.text();
  res.send(data);
}
