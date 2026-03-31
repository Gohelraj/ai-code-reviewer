import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const SUPPORTED_LANGS = [
  "typescript", "javascript", "tsx", "jsx", "css", "json",
  "python", "go", "java", "rust", "yaml", "html", "markdown",
  "bash", "sql", "ruby", "php", "c", "cpp", "csharp", "swift",
  "kotlin", "scala", "dockerfile", "xml", "toml",
] as const;

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  mts: "typescript", mjs: "javascript", cts: "typescript", cjs: "javascript",
  css: "css", scss: "css", less: "css",
  json: "json", jsonc: "json",
  py: "python", go: "go", java: "java", rs: "rust",
  yaml: "yaml", yml: "yaml",
  html: "html", htm: "html", vue: "html", svelte: "html",
  md: "markdown", mdx: "markdown",
  sh: "bash", bash: "bash", zsh: "bash",
  sql: "sql", rb: "ruby", php: "php",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  cs: "csharp", swift: "swift", kt: "kotlin", scala: "scala",
  dockerfile: "dockerfile", xml: "xml", toml: "toml",
};

export function detectLanguage(filename: string): string {
  const basename = filename.split("/").pop() ?? filename;
  if (basename.toLowerCase() === "dockerfile") return "dockerfile";
  const ext = basename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [...SUPPORTED_LANGS],
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: string,
  isDark: boolean,
): Promise<string> {
  try {
    const highlighter = await getHighlighter();
    const theme = isDark ? "github-dark" : "github-light";
    const validLang = SUPPORTED_LANGS.includes(lang as (typeof SUPPORTED_LANGS)[number])
      ? lang
      : "text";
    return highlighter.codeToHtml(code, {
      lang: validLang,
      theme,
    });
  } catch {
    // Fallback: return escaped HTML
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
