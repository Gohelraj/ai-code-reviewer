import type { FunctionIndex, FunctionIndexEntry } from "./functionIndex";

export type CallGraph = {
  [fn: string]: {
    calls: string[];
    calledBy: string[];
  };
};

type CanonicalEntryGroup = {
  canonicalName: string;
  names: string[];
  entry: FunctionIndexEntry;
};

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function getEntryFingerprint(entry: FunctionIndexEntry): string {
  return `${entry.file}::${entry.body}`;
}

function chooseCanonicalName(names: string[]): string {
  const qualifiedNames = names.filter((name) => name.includes("."));
  const pool = qualifiedNames.length > 0 ? qualifiedNames : names;
  return [...pool].sort((left, right) => left.localeCompare(right))[0];
}

function groupCanonicalEntries(index: FunctionIndex): {
  groups: CanonicalEntryGroup[];
  aliasToCanonical: Record<string, string>;
} {
  const grouped = new Map<string, CanonicalEntryGroup>();

  for (const [name, entry] of Object.entries(index)) {
    const fingerprint = getEntryFingerprint(entry);
    const existing = grouped.get(fingerprint);

    if (existing) {
      existing.names.push(name);
      continue;
    }

    grouped.set(fingerprint, {
      canonicalName: name,
      names: [name],
      entry,
    });
  }

  const aliasToCanonical: Record<string, string> = {};
  const groups = Array.from(grouped.values()).map((group) => {
    const canonicalName = chooseCanonicalName(group.names);
    const names = dedupe(group.names);

    for (const name of names) {
      aliasToCanonical[name] = canonicalName;
    }

    return {
      ...group,
      canonicalName,
      names,
    };
  });

  return { groups, aliasToCanonical };
}

function resolveCalledFunction(name: string, aliasToCanonical: Record<string, string>): string | null {
  return aliasToCanonical[name] ?? null;
}

export function buildCallGraph(functionIndex: FunctionIndex): CallGraph {
  const { groups, aliasToCanonical } = groupCanonicalEntries(functionIndex);
  const graph: CallGraph = {};

  for (const group of groups) {
    graph[group.canonicalName] = {
      calls: [],
      calledBy: [],
    };
  }

  for (const group of groups) {
    const resolvedCalls = dedupe(
      group.entry.calls
        .map((name) => resolveCalledFunction(name, aliasToCanonical))
        .filter((name): name is string => !!name),
    );

    graph[group.canonicalName].calls = resolvedCalls;

    for (const callee of resolvedCalls) {
      graph[callee].calledBy = dedupe([...graph[callee].calledBy, group.canonicalName]);
    }
  }

  return graph;
}

export function getFunctionCallers(callGraph: CallGraph, functionName: string): string[] {
  return callGraph[functionName]?.calledBy ?? [];
}

export function getFunctionCallees(callGraph: CallGraph, functionName: string): string[] {
  return callGraph[functionName]?.calls ?? [];
}
