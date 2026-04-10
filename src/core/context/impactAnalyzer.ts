import type { FileDiff } from "../../types";
import type { StructuredReviewContext } from "./contextBuilder";

export type ImpactAnalysis = {
  risk: "low" | "medium" | "high";
  reasons: string[];
  affectedFunctions: number;
  affectedFiles: number;
  touchedLayers: string[];
};

const LAYER_PATTERNS: Array<{ layer: string; pattern: RegExp }> = [
  { layer: "controller / route", pattern: /(controller|controllers|route|routes|router|handlers?)/i },
  { layer: "service", pattern: /(service|services|usecase|use-cases?)/i },
  { layer: "DB layer", pattern: /(repo|repository|dao|dal|model|models|schema|db|database|migration|query)/i },
];

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function analyzeImpact(changedFiles: FileDiff[], context: StructuredReviewContext): ImpactAnalysis {
  const changedFileNames = changedFiles
    .filter((file) => file.status !== "context" && file.status !== "removed")
    .map((file) => file.filename);

  const affectedFunctions = dedupe(
    context.files.flatMap((file) => [
      ...file.changedFunctions,
      ...file.callers.map((caller) => caller.function),
      ...file.callees.map((callee) => callee.function),
    ]),
  );

  const affectedFiles = dedupe([
    ...changedFileNames,
    ...context.files.flatMap((file) => [
      file.file,
      ...file.callers.map((caller) => caller.file),
      ...file.callees.map((callee) => callee.file),
      ...file.relatedFiles,
    ]),
  ]);

  const touchedLayers = dedupe(
    affectedFiles.flatMap((file) =>
      LAYER_PATTERNS.filter(({ pattern }) => pattern.test(file)).map(({ layer }) => layer),
    ),
  );

  const reasons: string[] = [];
  let score = 0;

  if (affectedFunctions.length >= 10) {
    score += 3;
    reasons.push(`Touches ${affectedFunctions.length} functions across the call graph`);
  } else if (affectedFunctions.length >= 5) {
    score += 2;
    reasons.push(`Touches ${affectedFunctions.length} functions`);
  } else if (affectedFunctions.length > 0) {
    score += 1;
    reasons.push(`Touches ${affectedFunctions.length} directly relevant functions`);
  }

  if (affectedFiles.length >= 8) {
    score += 3;
    reasons.push(`Impacts ${affectedFiles.length} files`);
  } else if (affectedFiles.length >= 4) {
    score += 2;
    reasons.push(`Spans ${affectedFiles.length} files`);
  } else if (affectedFiles.length > 1) {
    score += 1;
    reasons.push(`Cross-file change across ${affectedFiles.length} files`);
  }

  if (touchedLayers.length >= 3) {
    score += 4;
    reasons.push(`Touches multiple critical layers: ${touchedLayers.join(", ")}`);
  } else if (touchedLayers.length >= 2) {
    score += 3;
    reasons.push(`Touches critical layers: ${touchedLayers.join(", ")}`);
  } else if (touchedLayers.length === 1) {
    score += 2;
    reasons.push(`Touches ${touchedLayers[0]}`);
  }

  const risk: ImpactAnalysis["risk"] = score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  if (reasons.length === 0) {
    reasons.push("Small isolated change with limited structural spread");
  }

  return {
    risk,
    reasons,
    affectedFunctions: affectedFunctions.length,
    affectedFiles: affectedFiles.length,
    touchedLayers,
  };
}

export function buildImpactAnalysisText(impact: ImpactAnalysis): string {
  return `Risk: ${impact.risk}
Affected functions: ${impact.affectedFunctions}
Affected files: ${impact.affectedFiles}
Touched layers: ${impact.touchedLayers.length > 0 ? impact.touchedLayers.join(", ") : "none"}
Reasons:
${impact.reasons.map((reason) => `- ${reason}`).join("\n")}`;
}
