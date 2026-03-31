import type { FileDiff, ReviewerSuggestion } from "../types";

interface CodeownersRule {
  pattern: string;
  owners: string[];
  regex: RegExp;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function patternToRegex(pattern: string): RegExp {
  const trimmed = pattern.trim();
  const anchored = trimmed.startsWith("/");
  const directoryOnly = trimmed.endsWith("/");
  const normalized = trimmed
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegex(char);
  }

  const prefix = anchored ? "^" : "^(?:.*/)?";
  const suffix = directoryOnly ? "(?:/.*)?$" : "$";
  return new RegExp(`${prefix}${source}${suffix}`);
}

export function parseCodeowners(content: string): CodeownersRule[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      if (!pattern || owners.length === 0) {
        return [];
      }
      return [{
        pattern,
        owners,
        regex: patternToRegex(pattern),
      }];
    });
}

export function getCodeownersForFile(filename: string, rules: CodeownersRule[]): string[] {
  const normalized = filename.replace(/^\/+/, "");
  let matchedOwners: string[] = [];
  for (const rule of rules) {
    if (rule.regex.test(normalized)) {
      matchedOwners = rule.owners;
    }
  }
  return matchedOwners;
}

export function buildReviewerSuggestions(files: FileDiff[], rules: CodeownersRule[]): ReviewerSuggestion[] {
  const reviewerToFiles = new Map<string, Set<string>>();

  for (const file of files) {
    if (file.status === "removed") {
      continue;
    }
    const owners = getCodeownersForFile(file.filename, rules);
    for (const owner of owners) {
      if (!reviewerToFiles.has(owner)) {
        reviewerToFiles.set(owner, new Set());
      }
      reviewerToFiles.get(owner)?.add(file.filename);
    }
  }

  return [...reviewerToFiles.entries()]
    .map(([reviewer, fileSet]) => ({
      reviewer,
      files: [...fileSet].sort(),
    }))
    .sort((left, right) => {
      if (right.files.length !== left.files.length) {
        return right.files.length - left.files.length;
      }
      return left.reviewer.localeCompare(right.reviewer);
    });
}
