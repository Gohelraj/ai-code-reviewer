import type { FileDiff, ReviewContextInsight } from "../../types";
import { buildCallGraph, getFunctionCallees, getFunctionCallers } from "./callGraph";
import { buildFunctionIndex, type FunctionIndex } from "./functionIndex";
const MAX_STRUCTURED_CONTEXT_FILES = 8;
const MAX_FUNCTION_BODY_CHARS = 600;
const MAX_STRUCTURED_CONTEXT_CHARS = 8_000;

export interface FileExecutionContext {
  file: string;
  changedFunctions: string[];
  functionBodies: Array<{ name: string; body: string }>;
  callers: Array<{ function: string; file: string }>;
  callees: Array<{ function: string; file: string }>;
  imports: string[];
  relatedFiles: string[];
}

export interface StructuredReviewContext {
  files: FileExecutionContext[];
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function parseWithAst(filePath: string, content: string) {
  const { parseFile } = await import("../ast/languageAdapter");
  return parseFile(filePath, content);
}

function findFileContent(file: Pick<FileDiff, "fullContent" | "patch">): string {
  return file.fullContent ?? file.patch ?? "";
}

function getDefinedFunctionsForFile(functionIndex: FunctionIndex, filePath: string): string[] {
  return Object.entries(functionIndex)
    .filter(([, entry]) => entry.file === filePath)
    .map(([name]) => name)
    .filter((name) => !name.includes(".") || name.split(".").length === 2);
}

function findChangedFunctionsForPatch(functionNames: string[], patch: string | null): string[] {
  if (!patch) {
    return [];
  }

  return functionNames.filter((name) => patch.includes(name));
}

function getUniqueBodies(functionIndex: FunctionIndex, names: string[]): Array<{ name: string; body: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; body: string }> = [];

  for (const name of names) {
    const entry = functionIndex[name];
    if (!entry) {
      continue;
    }

    const key = `${entry.file}::${entry.body}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ name, body: entry.body.slice(0, MAX_FUNCTION_BODY_CHARS) });
  }

  return result;
}

function sortAndLimitFunctionRefs(functionNames: string[], functionIndex: FunctionIndex, limit: number): Array<{ function: string; file: string }> {
  return dedupe(functionNames)
    .map((name) => ({
      function: name,
      file: functionIndex[name]?.file ?? "",
    }))
    .filter((entry) => !!entry.file)
    .sort((left, right) => left.function.localeCompare(right.function))
    .slice(0, limit);
}

export async function buildStructuredContext(
  changedFiles: FileDiff[],
  allFiles: FileDiff[],
  insights: ReviewContextInsight[],
): Promise<StructuredReviewContext> {
  const functionIndex = await buildFunctionIndex(allFiles);
  const callGraph = buildCallGraph(functionIndex);

  const prioritizedChangedFiles = [...changedFiles]
    .filter((file) => file.status !== "context" && file.status !== "removed")
    .sort((left, right) => right.changes - left.changes)
    .slice(0, MAX_STRUCTURED_CONTEXT_FILES);

  const files = await Promise.all(prioritizedChangedFiles.map(async (file) => {
    const content = findFileContent(file);
    const parsed = content ? await parseWithAst(file.filename, content) : null;
    const definedFunctions = getDefinedFunctionsForFile(functionIndex, file.filename);
    const changedFunctions = dedupe([
      ...findChangedFunctionsForPatch(definedFunctions, file.patch),
      ...definedFunctions.filter((name) => !name.includes(".")).slice(0, file.patch ? 0 : 3),
    ]).slice(0, 5);

    const callers = sortAndLimitFunctionRefs(
      changedFunctions.flatMap((name) => getFunctionCallers(callGraph, name)),
      functionIndex,
      5,
    );

    const callees = sortAndLimitFunctionRefs(
      changedFunctions.flatMap((name) => getFunctionCallees(callGraph, name)),
      functionIndex,
      5,
    );

    return {
      file: file.filename,
      changedFunctions,
      functionBodies: getUniqueBodies(functionIndex, changedFunctions).slice(0, 5),
      callers,
      callees,
      imports: dedupe((parsed?.imports ?? []).filter(Boolean)).slice(0, 8),
      relatedFiles: dedupe(
        insights
          .filter((insight) => insight.file !== file.filename)
          .filter((insight) => insight.reason.includes(file.filename) || insight.file === file.filename || callers.some((caller) => caller.file === insight.file) || callees.some((callee) => callee.file === insight.file))
          .map((insight) => insight.file),
      ).slice(0, 8),
    };
  }));

  return { files };
}

export function buildStructuredContextText(context: StructuredReviewContext): string {
  if (context.files.length === 0) {
    return "No structured execution context was built.";
  }

  const sections = context.files.map((fileContext) => {
    const changedFunctions = fileContext.changedFunctions.length > 0
      ? fileContext.changedFunctions.join(", ")
      : "No changed functions identified";
    const functionBodies = fileContext.functionBodies.length > 0
      ? fileContext.functionBodies
        .map((entry) => `Function: ${entry.name}\n${entry.body}`)
        .join("\n\n")
      : "No function bodies available";
    const callers = fileContext.callers.length > 0
      ? fileContext.callers.map((entry) => `${entry.function} (${entry.file})`).join(", ")
      : "None";
    const callees = fileContext.callees.length > 0
      ? fileContext.callees.map((entry) => `${entry.function} (${entry.file})`).join(", ")
      : "None";
    const imports = fileContext.imports.length > 0 ? fileContext.imports.join(", ") : "None";
    const relatedFiles = fileContext.relatedFiles.length > 0 ? fileContext.relatedFiles.join(", ") : "None";

    return `## ${fileContext.file}
CHANGED FUNCTIONS:
${changedFunctions}

FUNCTION BODIES:
${functionBodies}

CALLERS:
${callers}

CALLEES:
${callees}

IMPORTS:
${imports}

RELATED FILES:
${relatedFiles}`;
  });

  const text = sections.join("\n\n");
  if (text.length <= MAX_STRUCTURED_CONTEXT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_STRUCTURED_CONTEXT_CHARS)}\n\n... [structured context truncated]`;
}
