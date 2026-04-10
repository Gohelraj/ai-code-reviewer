import type { FileDiff } from "../../types";

export type RuntimeSignal = {
  file: string;
  category: "node" | "go";
  severity: "info" | "warning";
  kind: string;
  summary: string;
};

function dedupeSignals(signals: RuntimeSignal[]): RuntimeSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.file}::${signal.category}::${signal.kind}::${signal.summary}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function parseWithAst(filePath: string, content: string) {
  const { parseFile } = await import("../ast/languageAdapter");
  return parseFile(filePath, content);
}

function isTsLike(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(filePath);
}

function isGo(filePath: string): boolean {
  return filePath.endsWith(".go");
}

async function detectNodeSignals(file: FileDiff): Promise<RuntimeSignal[]> {
  const content = file.fullContent ?? file.patch ?? "";
  if (!content) {
    return [];
  }

  const parsed = await parseWithAst(file.filename, content);
  const signals: RuntimeSignal[] = [];

  const callNames = parsed.calls;
  const hasPromiseLikeCalls = callNames.some((name) => /(fetch|then|catch|all|race|resolve|reject|save|create|update|delete|request|query)/i.test(name));
  const hasAwait = /\bawait\b/.test(content);
  const hasForLoop = /\bfor\s*\(|\bfor\s+const\b|\bfor\s+let\b/.test(content);
  const hasTryCatch = /\btry\b[\s\S]*\bcatch\b/.test(content);

  if (hasPromiseLikeCalls && !hasAwait && /\basync\b|\bPromise\b/.test(content)) {
    signals.push({
      file: file.filename,
      category: "node",
      severity: "warning",
      kind: "unawaited-promises",
      summary: "Async or promise-like calls appear without matching await usage in the changed file",
    });
  }

  if (hasAwait && hasForLoop) {
    signals.push({
      file: file.filename,
      category: "node",
      severity: "warning",
      kind: "async-in-loop",
      summary: "Await appears alongside loop constructs, which can hide serial latency or control-flow bugs",
    });
  }

  if ((/\basync\b/.test(content) || hasPromiseLikeCalls) && !hasTryCatch) {
    signals.push({
      file: file.filename,
      category: "node",
      severity: "info",
      kind: "missing-error-handling",
      summary: "Async logic appears without nearby try/catch handling in the changed file",
    });
  }

  return signals;
}

function detectGoSignals(file: FileDiff): RuntimeSignal[] {
  const content = file.fullContent ?? file.patch ?? "";
  if (!content) {
    return [];
  }

  const signals: RuntimeSignal[] = [];

  if (/go\s+\w+\(/.test(content) && !/(WaitGroup|Mutex|RLock|Lock|errgroup|context\.|chan )/.test(content)) {
    signals.push({
      file: file.filename,
      category: "go",
      severity: "warning",
      kind: "goroutine-without-sync",
      summary: "Goroutine usage appears without obvious synchronization or coordination primitives nearby",
    });
  }

  if (/\bif\s+err\s*!=\s*nil\b/.test(content) === false && /\berr\b/.test(content) && /[=:]\s*.*\berr\b|\berr\s*:=|\b,\s*err\s*:=/.test(content)) {
    signals.push({
      file: file.filename,
      category: "go",
      severity: "warning",
      kind: "ignored-errors",
      summary: "Error values appear to be assigned without explicit error handling",
    });
  }

  if (/(go\s+\w+\(|chan |Mutex|RWMutex)/.test(content) && /\b(map\[|append\(|=\s*\w+\[)/.test(content)) {
    signals.push({
      file: file.filename,
      category: "go",
      severity: "info",
      kind: "shared-state-risk",
      summary: "Concurrency constructs and mutable state appear together, which can hide shared access bugs",
    });
  }

  return signals;
}

export async function detectRuntimeSignals(files: FileDiff[]): Promise<RuntimeSignal[]> {
  const signals: RuntimeSignal[] = [];

  for (const file of files.filter((entry) => entry.status !== "context" && entry.status !== "removed")) {
    if (isTsLike(file.filename)) {
      signals.push(...await detectNodeSignals(file));
      continue;
    }

    if (isGo(file.filename)) {
      signals.push(...detectGoSignals(file));
    }
  }

  return dedupeSignals(signals);
}

export function buildRuntimeSignalsText(signals: RuntimeSignal[]): string {
  if (signals.length === 0) {
    return "No runtime-focused signals were detected.";
  }

  return `runtime signals:
${signals
  .map((signal) => `- [${signal.category}/${signal.severity}] ${signal.file}: ${signal.summary}`)
  .join("\n")}`;
}
