import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, ChevronUp, Plus, Minus, FilePlus, FileX, FilePen, Columns2, Rows3 } from "lucide-react";
import type { FileDiff } from "../types";
import { getHighlighter, detectLanguage } from "../lib/highlighter";
import type { BundledLanguage } from "shiki";

interface DiffViewerProps {
  file: FileDiff;
  defaultOpen?: boolean;
}

// ─── File-type icon colors by extension ─────────────────────────────────────
const EXT_COLORS: Record<string, string> = {
  ts: "text-blue-500", tsx: "text-blue-500", js: "text-yellow-500", jsx: "text-yellow-500",
  css: "text-purple-500", scss: "text-purple-500", html: "text-orange-500",
  json: "text-yellow-600", py: "text-green-500", go: "text-cyan-500",
  rs: "text-orange-600", java: "text-red-500", md: "text-muted-foreground",
  yaml: "text-pink-500", yml: "text-pink-500", sql: "text-blue-400",
  sh: "text-green-600", rb: "text-red-400", php: "text-indigo-500",
};

function getFileIconColor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "text-muted-foreground";
}

function getStatusIcon(status: string, filename: string) {
  const color = getFileIconColor(filename);
  switch (status) {
    case "added": return <FilePlus size={13} className="text-accent" />;
    case "removed": return <FileX size={13} className="text-destructive" />;
    default: return <FilePen size={13} className={color} />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "added": return "text-accent bg-accent/10 border-accent/20";
    case "removed": return "text-destructive bg-destructive/10 border-destructive/20";
    default: return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-500/10 dark:border-yellow-500/20";
  }
}

// ─── Patch parsing ──────────────────────────────────────────────────────────

interface DiffLine {
  type: "add" | "remove" | "context" | "hunk" | "meta";
  content: string;
  oldNum: number | null;
  newNum: number | null;
}

function parsePatch(patch: string): DiffLine[] {
  const rawLines = patch.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of rawLines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line, oldNum: null, newNum: null });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1), oldNum: null, newNum: newLine });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "remove", content: line.slice(1), oldNum: oldLine, newNum: null });
      oldLine++;
    } else if (line.startsWith("\\")) {
      result.push({ type: "meta", content: line, oldNum: null, newNum: null });
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      result.push({ type: "context", content, oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }
  return result;
}

// ─── Collapsible hunk building ──────────────────────────────────────────────

interface HunkSection {
  type: "lines" | "collapsed";
  lines: DiffLine[];
}

function buildSections(lines: DiffLine[], collapseThreshold = 6): HunkSection[] {
  const sections: HunkSection[] = [];
  let contextBuffer: DiffLine[] = [];

  const flushContext = () => {
    if (contextBuffer.length <= collapseThreshold) {
      if (contextBuffer.length > 0) {
        sections.push({ type: "lines", lines: contextBuffer });
      }
    } else {
      // Show first 2 and last 2, collapse middle
      sections.push({ type: "lines", lines: contextBuffer.slice(0, 2) });
      sections.push({ type: "collapsed", lines: contextBuffer.slice(2, -2) });
      sections.push({ type: "lines", lines: contextBuffer.slice(-2) });
    }
    contextBuffer = [];
  };

  for (const line of lines) {
    if (line.type === "context") {
      contextBuffer.push(line);
    } else {
      flushContext();
      // Add the non-context line in its own section or append to last
      const lastSection = sections[sections.length - 1];
      if (lastSection?.type === "lines" && sections.length > 0) {
        lastSection.lines.push(line);
      } else {
        sections.push({ type: "lines", lines: [line] });
      }
    }
  }
  flushContext();
  return sections;
}

// ─── Syntax highlighting hook ───────────────────────────────────────────────

function useHighlightedLines(lines: DiffLine[], filename: string): Map<number, string> {
  const [highlighted, setHighlighted] = useState<Map<number, string>>(new Map());
  const lang = useMemo(() => detectLanguage(filename), [filename]);
  const isDark = useMemo(() => document.documentElement.classList.contains("dark"), []);

  useEffect(() => {
    if (lang === "text" || lines.length === 0) return;
    let cancelled = false;

    getHighlighter().then((highlighter) => {
      if (cancelled) return;
      const map = new Map<number, string>();
      const theme = isDark ? "github-dark" : "github-light";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.type === "hunk" || line.type === "meta") continue;
        try {
          const tokens = highlighter.codeToTokens(line.content, { lang: lang as BundledLanguage, theme });
          const html = tokens.tokens[0]
            ?.map((t) => `<span style="color:${t.color}">${escapeHtml(t.content)}</span>`)
            .join("") ?? escapeHtml(line.content);
          map.set(i, html);
        } catch {
          map.set(i, escapeHtml(line.content));
        }
      }
      if (!cancelled) setHighlighted(map);
    });

    return () => { cancelled = true; };
  }, [lines, lang, isDark]);

  return highlighted;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Inline diff renderer ──────────────────────────────────────────────────

function InlineDiffView({ lines, filename }: { lines: DiffLine[]; filename: string }) {
  const sections = useMemo(() => buildSections(lines), [lines]);
  const highlighted = useHighlightedLines(lines, filename);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = useCallback((idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  // Build a flat line index map to get highlight data
  let globalIdx = 0;
  const sectionStartIndices: number[] = [];
  for (const section of sections) {
    sectionStartIndices.push(globalIdx);
    globalIdx += section.lines.length;
  }

  return (
    <div className="font-mono text-xs leading-5">
      {sections.map((section, sIdx) => {
        if (section.type === "collapsed" && !expandedSections.has(sIdx)) {
          return (
            <button
              key={sIdx}
              onClick={() => toggleSection(sIdx)}
              className="w-full flex items-center justify-center py-1.5 bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs transition-colors border-y border-border"
            >
              <ChevronDown size={12} className="mr-1" />
              Show {section.lines.length} unchanged lines
            </button>
          );
        }

        const linesToRender = section.type === "collapsed" ? section.lines : section.lines;
        const startIdx = sectionStartIndices[sIdx];

        return (
          <div key={sIdx}>
            {section.type === "collapsed" && expandedSections.has(sIdx) && (
              <button
                onClick={() => toggleSection(sIdx)}
                className="w-full flex items-center justify-center py-1 bg-secondary/40 hover:bg-secondary text-muted-foreground text-xs transition-colors border-y border-border"
              >
                <ChevronUp size={12} className="mr-1" />
                Collapse
              </button>
            )}
            {linesToRender.map((line, lIdx) => {
              const gIdx = startIdx + lIdx;
              const hl = highlighted.get(gIdx);

              let bg = "";
              let gutterBg = "";
              if (line.type === "add") { bg = "bg-accent/8 dark:bg-accent/10"; gutterBg = "bg-accent/15 dark:bg-accent/15"; }
              else if (line.type === "remove") { bg = "bg-destructive/8 dark:bg-destructive/10"; gutterBg = "bg-destructive/15 dark:bg-destructive/15"; }
              else if (line.type === "hunk") { bg = "bg-secondary"; gutterBg = "bg-secondary"; }

              return (
                <div key={`${sIdx}-${lIdx}`} className={`flex ${bg} min-w-0`}>
                  {/* Old line number */}
                  <span className={`select-none w-10 text-right pr-2 flex-shrink-0 text-muted-foreground/50 py-0.5 ${gutterBg} border-r border-border/50`}>
                    {line.oldNum ?? ""}
                  </span>
                  {/* New line number */}
                  <span className={`select-none w-10 text-right pr-2 flex-shrink-0 text-muted-foreground/50 py-0.5 ${gutterBg} border-r border-border/50`}>
                    {line.newNum ?? ""}
                  </span>
                  {/* +/- indicator */}
                  <span className={`select-none w-5 text-center flex-shrink-0 py-0.5 ${
                    line.type === "add" ? "text-accent" : line.type === "remove" ? "text-destructive" : "text-transparent"
                  }`}>
                    {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                  </span>
                  {/* Content */}
                  {line.type === "hunk" ? (
                    <span className="flex-1 text-muted-foreground py-0.5 pr-2 whitespace-pre-wrap">{line.content}</span>
                  ) : hl ? (
                    <span
                      className="flex-1 py-0.5 pr-2 whitespace-pre-wrap break-all [&>span]:!bg-transparent"
                      dangerouslySetInnerHTML={{ __html: hl }}
                    />
                  ) : (
                    <span className="flex-1 text-foreground py-0.5 pr-2 whitespace-pre-wrap break-all">
                      {line.content}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Split diff renderer ────────────────────────────────────────────────────

function SplitDiffView({ lines, filename }: { lines: DiffLine[]; filename: string }) {
  const highlighted = useHighlightedLines(lines, filename);

  // Build paired rows: each row has left (old) and right (new)
  const rows: Array<{ left: DiffLine | null; right: DiffLine | null; globalLeft: number; globalRight: number }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "hunk") {
      rows.push({ left: line, right: line, globalLeft: i, globalRight: i });
      i++;
    } else if (line.type === "meta") {
      i++;
    } else if (line.type === "remove") {
      // Collect consecutive removes, then pair with following adds
      const removes: { line: DiffLine; idx: number }[] = [];
      while (i < lines.length && lines[i].type === "remove") {
        removes.push({ line: lines[i], idx: i });
        i++;
      }
      const adds: { line: DiffLine; idx: number }[] = [];
      while (i < lines.length && lines[i].type === "add") {
        adds.push({ line: lines[i], idx: i });
        i++;
      }
      const maxLen = Math.max(removes.length, adds.length);
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          left: removes[j]?.line ?? null,
          right: adds[j]?.line ?? null,
          globalLeft: removes[j]?.idx ?? -1,
          globalRight: adds[j]?.idx ?? -1,
        });
      }
    } else if (line.type === "add") {
      rows.push({ left: null, right: line, globalLeft: -1, globalRight: i });
      i++;
    } else {
      // context
      rows.push({ left: line, right: line, globalLeft: i, globalRight: i });
      i++;
    }
  }

  return (
    <div className="font-mono text-xs leading-5">
      {rows.map((row, rIdx) => {
        const isHunk = row.left?.type === "hunk";
        if (isHunk) {
          return (
            <div key={rIdx} className="flex bg-secondary min-w-0 border-b border-border/30">
              <span className="flex-1 text-muted-foreground py-0.5 px-3 whitespace-pre-wrap text-center">
                {row.left?.content}
              </span>
            </div>
          );
        }

        return (
          <div key={rIdx} className="flex min-w-0">
            {/* Left side (old) */}
            <div className={`flex flex-1 border-r border-border/40 ${
              row.left?.type === "remove" ? "bg-destructive/8 dark:bg-destructive/10" : !row.left ? "bg-muted/30" : ""
            }`}>
              <span className="select-none w-10 text-right pr-2 flex-shrink-0 text-muted-foreground/50 py-0.5 border-r border-border/50">
                {row.left?.oldNum ?? ""}
              </span>
              <span className={`select-none w-5 text-center flex-shrink-0 py-0.5 ${
                row.left?.type === "remove" ? "text-destructive" : "text-transparent"
              }`}>
                {row.left?.type === "remove" ? "−" : " "}
              </span>
              {row.left ? (
                highlighted.get(row.globalLeft) ? (
                  <span className="flex-1 py-0.5 pr-2 whitespace-pre-wrap break-all [&>span]:!bg-transparent"
                    dangerouslySetInnerHTML={{ __html: highlighted.get(row.globalLeft)! }} />
                ) : (
                  <span className="flex-1 text-foreground py-0.5 pr-2 whitespace-pre-wrap break-all">{row.left.content}</span>
                )
              ) : (
                <span className="flex-1" />
              )}
            </div>
            {/* Right side (new) */}
            <div className={`flex flex-1 ${
              row.right?.type === "add" ? "bg-accent/8 dark:bg-accent/10" : !row.right ? "bg-muted/30" : ""
            }`}>
              <span className="select-none w-10 text-right pr-2 flex-shrink-0 text-muted-foreground/50 py-0.5 border-r border-border/50">
                {row.right?.newNum ?? ""}
              </span>
              <span className={`select-none w-5 text-center flex-shrink-0 py-0.5 ${
                row.right?.type === "add" ? "text-accent" : "text-transparent"
              }`}>
                {row.right?.type === "add" ? "+" : " "}
              </span>
              {row.right ? (
                highlighted.get(row.globalRight) ? (
                  <span className="flex-1 py-0.5 pr-2 whitespace-pre-wrap break-all [&>span]:!bg-transparent"
                    dangerouslySetInnerHTML={{ __html: highlighted.get(row.globalRight)! }} />
                ) : (
                  <span className="flex-1 text-foreground py-0.5 pr-2 whitespace-pre-wrap break-all">{row.right.content}</span>
                )
              ) : (
                <span className="flex-1" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main DiffViewer component ──────────────────────────────────────────────

export function DiffViewer({ file, defaultOpen = false }: DiffViewerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [viewMode, setViewMode] = useState<"inline" | "split">("inline");
  const filename = file.filename.split("/").pop() ?? file.filename;
  const filepath = file.filename.substring(0, file.filename.length - filename.length);
  const lines = useMemo(() => file.patch ? parsePatch(file.patch) : [], [file.patch]);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
      >
        {getStatusIcon(file.status, file.filename)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono truncate">{filepath}</span>
            <span className="text-sm font-medium text-foreground font-mono">{filename}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border font-medium ${getStatusColor(file.status)}`}>
            {file.status}
          </span>
          <span className="text-xs text-accent font-medium">+{file.additions}</span>
          <span className="text-xs text-destructive font-medium">-{file.deletions}</span>
          {isOpen ? (
            <ChevronUp size={15} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={15} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border">
          {file.patch ? (
            <>
              {/* View mode toggle */}
              <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-secondary/30 border-b border-border">
                <button
                  onClick={(e) => { e.stopPropagation(); setViewMode("inline"); }}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                    viewMode === "inline" ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Rows3 size={12} />
                  Inline
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setViewMode("split"); }}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                    viewMode === "split" ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns2 size={12} />
                  Split
                </button>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto bg-background/50">
                {viewMode === "inline" ? (
                  <InlineDiffView lines={lines} filename={file.filename} />
                ) : (
                  <SplitDiffView lines={lines} filename={file.filename} />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No diff available (binary file or no changes)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffStats({ additions, deletions, changedFiles }: { additions: number; deletions: number; changedFiles: number }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded flex items-center justify-center bg-accent/10">
          <Plus size={10} className="text-accent" />
        </div>
        <span className="text-accent font-semibold">+{additions.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded flex items-center justify-center bg-destructive/10">
          <Minus size={10} className="text-destructive" />
        </div>
        <span className="text-destructive font-semibold">-{deletions.toLocaleString()}</span>
      </div>
      <div className="text-muted-foreground">
        {changedFiles} file{changedFiles !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
