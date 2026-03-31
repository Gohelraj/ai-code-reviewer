/**
 * Minimal production server for self-hosting.
 *
 * Serves the built frontend (dist/) and proxies GitLab API requests to
 * gitlab.com to work around its lack of CORS headers.
 *
 * Usage:
 *   npm run build
 *   node server.js          # runs on port 3000 by default
 *   PORT=8080 node server.js
 */

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

// Proxy /api/gitlab/... → https://gitlab.com/...
app.use(
  "/api/gitlab",
  createProxyMiddleware({
    target: "https://gitlab.com",
    changeOrigin: true,
    pathRewrite: { "^/api/gitlab": "" },
  })
);

// Serve built frontend
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
