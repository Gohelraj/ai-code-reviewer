import { createEmptyParsedFileAst, type ParsedFileAst } from "./types";
import { parseTypeScriptSource } from "./tsParser";

const TS_JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
const MAX_PARSE_CACHE_ENTRIES = 200;
const parseCache = new Map<string, Promise<ParsedFileAst>>();

function isTypeScriptLikeFile(filePath: string): boolean {
  return TS_JS_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function canUseNodeRuntime(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

function createCacheKey(filePath: string, content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return `${filePath}:${content.length}:${hash}`;
}

function rememberCachedParse(key: string, value: Promise<ParsedFileAst>): Promise<ParsedFileAst> {
  if (parseCache.has(key)) {
    parseCache.delete(key);
  }

  parseCache.set(key, value);

  if (parseCache.size > MAX_PARSE_CACHE_ENTRIES) {
    const oldestKey = parseCache.keys().next().value;
    if (oldestKey) {
      parseCache.delete(oldestKey);
    }
  }

  return value;
}

async function parseFileUncached(filePath: string, content: string): Promise<ParsedFileAst> {
  if (!content) {
    return createEmptyParsedFileAst();
  }

  if (isTypeScriptLikeFile(filePath)) {
    return parseTypeScriptSource(content, filePath);
  }

  if (filePath.endsWith(".go")) {
    if (!canUseNodeRuntime()) {
      return createEmptyParsedFileAst();
    }

    const goParserModuleUrl = new URL("./goParser.ts", import.meta.url).href;
    const { parseGoSource } = await import(/* @vite-ignore */ goParserModuleUrl);
    return parseGoSource(filePath, content);
  }

  return createEmptyParsedFileAst();
}

export async function parseFile(filePath: string, content: string): Promise<ParsedFileAst> {
  const key = createCacheKey(filePath, content);
  const cached = parseCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = parseFileUncached(filePath, content).catch((error) => {
    parseCache.delete(key);
    throw error;
  });

  return rememberCachedParse(key, pending);
}
