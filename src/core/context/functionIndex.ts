import type { FileDiff } from "../../types";

export type FunctionIndexEntry = {
  file: string;
  body: string;
  calls: string[];
};

export type FunctionIndex = {
  [name: string]: FunctionIndexEntry;
};

const functionIndexCache = new Map<string, Promise<FunctionIndex>>();
const MAX_FUNCTION_INDEX_CACHE_ENTRIES = 50;

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function trimFunctionBody(body: string): string {
  return body.trim();
}

async function parseWithAst(filePath: string, content: string) {
  const { parseFile } = await import("../ast/languageAdapter");
  return parseFile(filePath, content);
}

function getFunctionCalls(body: string, parsedCalls: string[]): string[] {
  if (!body) {
    return [];
  }

  return dedupe(parsedCalls.filter((call) => body.includes(call)));
}

function setIfMissing(index: FunctionIndex, key: string, entry: FunctionIndexEntry) {
  if (!key || index[key]) {
    return;
  }

  index[key] = entry;
}

function getFileContent(file: Pick<FileDiff, "fullContent" | "patch">): string {
  return file.fullContent ?? file.patch ?? "";
}

function createFilesCacheKey(files: Array<Pick<FileDiff, "filename" | "fullContent" | "patch">>): string {
  let hash = 0;
  for (const file of files) {
    const content = getFileContent(file);
    const fingerprint = `${file.filename}:${content.length}:${content}`;
    for (let index = 0; index < fingerprint.length; index += 1) {
      hash = (hash * 31 + fingerprint.charCodeAt(index)) >>> 0;
    }
  }

  return `${files.length}:${hash}`;
}

function rememberCachedIndex(key: string, value: Promise<FunctionIndex>): Promise<FunctionIndex> {
  if (functionIndexCache.has(key)) {
    functionIndexCache.delete(key);
  }

  functionIndexCache.set(key, value);

  if (functionIndexCache.size > MAX_FUNCTION_INDEX_CACHE_ENTRIES) {
    const oldestKey = functionIndexCache.keys().next().value;
    if (oldestKey) {
      functionIndexCache.delete(oldestKey);
    }
  }

  return value;
}

export async function buildFunctionIndex(files: Array<Pick<FileDiff, "filename" | "fullContent" | "patch">>): Promise<FunctionIndex> {
  const cacheKey = createFilesCacheKey(files);
  const cached = functionIndexCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = buildFunctionIndexUncached(files).catch((error) => {
    functionIndexCache.delete(cacheKey);
    throw error;
  });

  return rememberCachedIndex(cacheKey, pending);
}

async function buildFunctionIndexUncached(files: Array<Pick<FileDiff, "filename" | "fullContent" | "patch">>): Promise<FunctionIndex> {
  const index: FunctionIndex = {};

  for (const file of files) {
    const content = getFileContent(file);
    if (!content) {
      continue;
    }

    const parsed = await parseWithAst(file.filename, content);

    for (const fn of parsed.functions) {
      setIfMissing(index, fn.name, {
        file: file.filename,
        body: trimFunctionBody(fn.body),
        calls: getFunctionCalls(fn.body, parsed.calls),
      });
    }

    for (const method of parsed.methods) {
      const entry: FunctionIndexEntry = {
        file: file.filename,
        body: trimFunctionBody(method.body),
        calls: getFunctionCalls(method.body, parsed.calls),
      };

      setIfMissing(index, method.name, entry);
      if (method.className) {
        setIfMissing(index, `${method.className}.${method.name}`, entry);
      }
      if (method.receiverType) {
        setIfMissing(index, `${method.receiverType}.${method.name}`, entry);
      }
    }
  }

  return index;
}

export function findFunctionDefinition(index: FunctionIndex, name: string): FunctionIndexEntry | null {
  return index[name] ?? null;
}
