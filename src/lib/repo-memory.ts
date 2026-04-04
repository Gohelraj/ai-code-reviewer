import type { RepoReviewMemory } from "../types";

const EMPTY_REPO_MEMORY: RepoReviewMemory = {
  purpose: [],
  architecture: [],
  domainRules: [],
  reviewPriorities: [],
  intentionalPatterns: [],
  avoidFlagging: [],
};

const SECTION_ALIASES: Array<{ key: keyof RepoReviewMemory; patterns: RegExp[] }> = [
  { key: "purpose", patterns: [/^purpose$/i, /^repo purpose$/i, /^overview$/i] },
  { key: "architecture", patterns: [/^architecture$/i, /^structure$/i, /^architecture\s*\/\s*structure$/i] },
  { key: "domainRules", patterns: [/^domain rules$/i, /^business rules$/i, /^constraints$/i] },
  { key: "reviewPriorities", patterns: [/^review priorities$/i, /^priorities$/i, /^review focus$/i] },
  { key: "intentionalPatterns", patterns: [/^intentional patterns$/i, /^tradeoffs$/i, /^approved patterns$/i] },
  { key: "avoidFlagging", patterns: [/^avoid flagging$/i, /^do not flag by default$/i, /^known exceptions$/i] },
];

function normalizeLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function resolveSectionKey(heading: string): keyof RepoReviewMemory | null {
  const normalized = heading.trim().replace(/^#+\s*/, "").trim();
  for (const entry of SECTION_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.key;
    }
  }
  return null;
}

export function parseRepoReviewMemory(raw?: string | null): RepoReviewMemory {
  if (!raw?.trim()) {
    return { ...EMPTY_REPO_MEMORY };
  }

  const memory: RepoReviewMemory = {
    purpose: [],
    architecture: [],
    domainRules: [],
    reviewPriorities: [],
    intentionalPatterns: [],
    avoidFlagging: [],
  };

  let currentKey: keyof RepoReviewMemory | null = null;
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("#")) {
      currentKey = resolveSectionKey(trimmed);
      continue;
    }

    const normalized = normalizeLine(trimmed);
    if (!normalized) {
      continue;
    }

    if (currentKey) {
      memory[currentKey].push(normalized);
      continue;
    }

    if (memory.purpose.length === 0) {
      memory.purpose.push(normalized);
    } else {
      memory.reviewPriorities.push(normalized);
    }
  }

  return memory;
}

function formatSection(title: string, values: string[]): string[] {
  if (values.length === 0) return [];
  return [
    `## ${title}`,
    ...values.map((value) => `- ${value}`),
    "",
  ];
}

export function formatRepoReviewMemory(memory: RepoReviewMemory): string {
  const lines = [
    ...formatSection("Purpose", memory.purpose),
    ...formatSection("Architecture", memory.architecture),
    ...formatSection("Domain Rules", memory.domainRules),
    ...formatSection("Review Priorities", memory.reviewPriorities),
    ...formatSection("Intentional Patterns", memory.intentionalPatterns),
    ...formatSection("Avoid Flagging", memory.avoidFlagging),
  ];

  return lines.join("\n").trim();
}

export function summarizeRepoReviewMemory(memory: RepoReviewMemory): string {
  const lines: string[] = [];

  if (memory.purpose.length > 0) {
    lines.push(`Purpose: ${memory.purpose.join("; ")}`);
  }
  if (memory.architecture.length > 0) {
    lines.push(`Architecture: ${memory.architecture.join("; ")}`);
  }
  if (memory.domainRules.length > 0) {
    lines.push(`Domain rules: ${memory.domainRules.join("; ")}`);
  }
  if (memory.reviewPriorities.length > 0) {
    lines.push(`Review priorities: ${memory.reviewPriorities.join("; ")}`);
  }
  if (memory.intentionalPatterns.length > 0) {
    lines.push(`Intentional patterns: ${memory.intentionalPatterns.join("; ")}`);
  }
  if (memory.avoidFlagging.length > 0) {
    lines.push(`Avoid flagging: ${memory.avoidFlagging.join("; ")}`);
  }

  return lines.join("\n");
}

export function hasRepoReviewMemory(memory: RepoReviewMemory): boolean {
  return Object.values(memory).some((section) => section.length > 0);
}
