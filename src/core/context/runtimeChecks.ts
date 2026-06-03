import type { FileDiff } from "../../types";
import { detectRuntimeAstSignals } from "../ast/tsParser";

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

  const signals: RuntimeSignal[] = [];

  try {
    const ast = detectRuntimeAstSignals(content, file.filename);

    if (ast.hasAwaitInLoop) {
      signals.push({
        file: file.filename,
        category: "node",
        severity: "warning",
        kind: "async-in-loop",
        summary: "Await expression found inside a loop body — may cause unintended serial execution or missed parallelism",
      });
    }

    if (ast.hasUnawaitedAsyncCall) {
      signals.push({
        file: file.filename,
        category: "node",
        severity: "warning",
        kind: "unawaited-promises",
        summary: "Async-pattern call used as a statement without await — the returned Promise may be silently discarded",
      });
    }

    if (ast.hasAsyncWithoutErrorHandling) {
      signals.push({
        file: file.filename,
        category: "node",
        severity: "info",
        kind: "missing-error-handling",
        summary: "Async function body has no try/catch — unhandled rejections will propagate to callers silently",
      });
    }
  } catch {
    // AST parse failure (e.g. syntax error in diff fragment) — skip signals for this file
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
