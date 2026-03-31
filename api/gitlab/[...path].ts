import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path" });

  const gitlabPath = Array.isArray(path) ? path.join("/") : path;

  // Prevent SSRF — only allow requests to gitlab.com API
  if (/[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(gitlabPath)) {
    return res.status(400).json({ error: "Invalid path" });
  }

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
