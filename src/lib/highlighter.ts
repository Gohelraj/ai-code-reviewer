import { createBundledHighlighter } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { HighlighterGeneric } from "@shikijs/types";

const SUPPORTED_LANGS = [
  "typescript", "javascript", "tsx", "jsx", "css", "json",
  "python", "go", "java", "rust", "yaml", "html",
  "bash", "sql", "dockerfile", "toml",
] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGS)[number];
type SupportedTheme = "github-light" | "github-dark";

const createHighlighter = createBundledHighlighter<SupportedLanguage, SupportedTheme>({
  langs: {
    typescript: () => import("@shikijs/langs/typescript"),
    javascript: () => import("@shikijs/langs/javascript"),
    tsx: () => import("@shikijs/langs/tsx"),
    jsx: () => import("@shikijs/langs/jsx"),
    css: () => import("@shikijs/langs/css"),
    json: () => import("@shikijs/langs/json"),
    python: () => import("@shikijs/langs/python"),
    go: () => import("@shikijs/langs/go"),
    java: () => import("@shikijs/langs/java"),
    rust: () => import("@shikijs/langs/rust"),
    yaml: () => import("@shikijs/langs/yaml"),
    html: () => import("@shikijs/langs/html"),
    bash: () => import("@shikijs/langs/bash"),
    sql: () => import("@shikijs/langs/sql"),
    dockerfile: () => import("@shikijs/langs/docker"),
    toml: () => import("@shikijs/langs/toml"),
  },
  themes: {
    "github-light": () => import("@shikijs/themes/github-light"),
    "github-dark": () => import("@shikijs/themes/github-dark"),
  },
  engine: () => createJavaScriptRegexEngine(),
});

let highlighterPromise: Promise<HighlighterGeneric<SupportedLanguage, SupportedTheme>> | null = null;

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

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGS.includes(lang as SupportedLanguage);
}

export type { SupportedLanguage };

export function getHighlighter(): Promise<HighlighterGeneric<SupportedLanguage, SupportedTheme>> {
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
    if (!isSupportedLanguage(lang)) {
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    const highlighter = await getHighlighter();
    const theme = isDark ? "github-dark" : "github-light";
    return highlighter.codeToHtml(code, {
      lang,
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
