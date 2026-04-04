import { useState, lazy, Suspense, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ChevronDown, ChevronUp, ExternalLink, GitCommitHorizontal, Network, Copy, Check, LayoutList, Workflow } from "lucide-react";
import type { ExecutionFlow, FlowGroup, MRData } from "../types";
import { DiffViewer } from "./DiffViewer";
import { ExpandableText } from "./ExpandableText";
import type { ResultViewMode } from "./ResultViewToggle";
import toast from "react-hot-toast";

const FlowDiagram = lazy(() => import("./FlowDiagram").then((m) => ({ default: m.FlowDiagram })));

interface ExecutionFlowPanelProps {
  flow: ExecutionFlow;
  mrData: MRData;
  viewMode?: ResultViewMode;
}

const LAYER_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  default: { bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  route: { bg: "bg-accent/5", border: "border-accent/20", text: "text-accent", dot: "bg-accent" },
  routes: { bg: "bg-accent/5", border: "border-accent/20", text: "text-accent", dot: "bg-accent" },
  controller: { bg: "bg-blue-50 dark:bg-blue-500/5", border: "border-blue-200 dark:border-blue-500/20", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  middleware: { bg: "bg-purple-50 dark:bg-purple-500/5", border: "border-purple-200 dark:border-purple-500/20", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  service: { bg: "bg-yellow-50 dark:bg-yellow-500/5", border: "border-yellow-200 dark:border-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400", dot: "bg-yellow-500" },
  repository: { bg: "bg-orange-50 dark:bg-orange-500/5", border: "border-orange-200 dark:border-orange-500/20", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  dal: { bg: "bg-orange-50 dark:bg-orange-500/5", border: "border-orange-200 dark:border-orange-500/20", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  model: { bg: "bg-pink-50 dark:bg-pink-500/5", border: "border-pink-200 dark:border-pink-500/20", text: "text-pink-600 dark:text-pink-400", dot: "bg-pink-500" },
  schema: { bg: "bg-pink-50 dark:bg-pink-500/5", border: "border-pink-200 dark:border-pink-500/20", text: "text-pink-600 dark:text-pink-400", dot: "bg-pink-500" },
  test: { bg: "bg-muted/30", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  tests: { bg: "bg-muted/30", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  config: { bg: "bg-muted/30", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  utils: { bg: "bg-secondary", border: "border-border", text: "text-foreground", dot: "bg-foreground" },
};

function getLayerStyle(layer: string) {
  const key = layer.toLowerCase().split(/[\s/]/)[0];
  return LAYER_COLORS[key] ?? LAYER_COLORS.default;
}

function FlowGroupCard({ group, mrData, index, viewMode }: { group: FlowGroup; mrData: MRData; index: number; viewMode: ResultViewMode }) {
  const compact = viewMode === "compact";
  const [expanded, setExpanded] = useState(!compact);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const style = getLayerStyle(group.layer);

  useEffect(() => {
    setExpanded(!compact);
    if (compact) setExpandedFile(null);
  }, [compact]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      <div className={`border rounded-2xl overflow-hidden ${style.border}`}>
        {/* Layer header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
        >
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>
                Layer {group.order}
              </span>
              <span className="text-sm font-semibold text-foreground">{group.layer}</span>
              <span className="text-xs text-muted-foreground">
                {group.files.length} file{group.files.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.layerDescription}</p>
          </div>
          {expanded ? <ChevronUp size={15} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground flex-shrink-0" />}
        </button>

        {expanded && (
          <div className={`border-t ${style.border} ${style.bg} space-y-3 p-4`}>
            {group.files.map((file) => {
              const fullFileDiff = mrData.files.find((f) => f.filename === file.filename || f.filename.endsWith(file.filename));
              const isExpanded = expandedFile === file.filename;

              return (
                <div key={file.filename} data-filename={file.filename} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* File header */}
                  <button
                    onClick={() => setExpandedFile(isExpanded ? null : file.filename)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors text-left"
                  >
                    <GitCommitHorizontal size={15} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium text-foreground truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{file.role}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={13} className="text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown size={13} className="text-muted-foreground flex-shrink-0 mt-1" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-3 bg-secondary/20">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Changes</p>
                        <ExpandableText
                          text={file.keyChanges}
                          collapsedLines={compact ? 2 : 4}
                          minLength={compact ? 100 : 220}
                          defaultExpanded={!compact}
                          className="text-sm text-foreground leading-relaxed"
                        />
                      </div>

                      {file.callsInto && file.callsInto.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <ExternalLink size={11} />
                            Calls Into
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {file.callsInto.map((dep) => (
                              <span key={dep} className="text-xs px-2 py-0.5 rounded-md bg-secondary border border-border text-foreground font-mono">
                                {dep}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {fullFileDiff && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Diff</p>
                          <DiffViewer file={fullFileDiff} defaultOpen={false} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ExecutionFlowPanel({ flow, mrData, viewMode = "detailed" }: ExecutionFlowPanelProps) {
  const sortedGroups = [...flow.flowGroups].sort((a, b) => a.order - b.order);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"list" | "diagram">("list");
  const [showAllGroups, setShowAllGroups] = useState(viewMode !== "compact");
  const compact = viewMode === "compact";

  useEffect(() => {
    setShowAllGroups(viewMode !== "compact");
  }, [viewMode]);

  const visibleGroups = showAllGroups ? sortedGroups : sortedGroups.slice(0, compact ? 4 : sortedGroups.length);

  const copyFlow = () => {
    const text = [
      `# Execution Flow`,
      ``,
      `## Overview`,
      flow.flowDescription,
      ``,
      `**Entry Point:** ${flow.entryPoint}`,
      `**Data Flow:** ${flow.dataFlow}`,
      ``,
      `## Layers`,
      `${sortedGroups.map((g) => g.layer).join(" \u2192 ")}`,
      ``,
      ...sortedGroups.map((g) => [
        `### Layer ${g.order}: ${g.layer}`,
        g.layerDescription,
        ``,
        ...g.files.map((f) =>
          `- **${f.filename}** \u2014 ${f.role}\n  ${f.keyChanges}${f.callsInto?.length ? `\n  Calls: ${f.callsInto.join(", ")}` : ""}`
        ),
        ``,
      ]).flat(),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Flow copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Overview */}
      <div className="bg-card border border-border rounded-2xl p-6 relative">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Network size={15} />
          Execution Flow Overview
        </h3>
        <div className="absolute top-6 right-6 flex items-center gap-2">
          <button
            onClick={copyFlow}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
          >
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors ${view === "list" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutList size={12} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setView("diagram")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors ${view === "diagram" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              <Workflow size={12} />
              <span className="hidden sm:inline">Diagram</span>
            </button>
          </div>
        </div>
        <div className="mb-4 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Overview</p>
          <ExpandableText
            text={flow.flowDescription}
            collapsedLines={compact ? 2 : 4}
            minLength={compact ? 120 : 240}
            defaultExpanded={!compact}
            className="text-sm text-muted-foreground leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-secondary/40 p-3 overflow-hidden">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entry Point</p>
            <p className="text-sm font-mono font-medium text-foreground break-all">{flow.entryPoint}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3 overflow-hidden">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Data Flow</p>
            <div className="text-sm text-foreground leading-relaxed">
              {flow.dataFlow.includes('→') || flow.dataFlow.includes('->') ? (
                <ul className="space-y-1">
                  {flow.dataFlow.split(/→|->/).map((segment, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      {i > 0 && <span className="text-muted-foreground flex-shrink-0">→</span>}
                      <span className="break-words">{segment.trim()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="break-words">{flow.dataFlow}</p>
              )}
            </div>
          </div>
        </div>

        {/* Flow breadcrumb */}
        <div className="mt-4 flex items-center gap-1 flex-wrap">
          {sortedGroups.map((group, i) => {
            const style = getLayerStyle(group.layer);
            return (
              <div key={group.layer} className="flex items-center gap-1">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${style.border} ${style.text} ${style.bg}`}>
                  {group.layer}
                </span>
                {i < sortedGroups.length - 1 && (
                  <span className="text-muted-foreground text-xs">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Flow content */}
      {view === "diagram" ? (
        <Suspense fallback={
          <div className="h-[500px] rounded-2xl border border-border flex items-center justify-center bg-card">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              <span className="text-sm">Loading diagram...</span>
            </div>
          </div>
        }>
          <FlowDiagram flow={flow} />
        </Suspense>
      ) : (
      /* Flow groups */
      <div className="space-y-3">
        {visibleGroups.map((group, i) => (
          <div key={group.layer} className="relative">
            <FlowGroupCard group={group} mrData={mrData} index={i} viewMode={viewMode} />
            {i < visibleGroups.length - 1 && (
              <div className="flex justify-center my-1">
                <ArrowDown size={16} className="text-muted-foreground/40" />
              </div>
            )}
          </div>
        ))}
        {compact && sortedGroups.length > visibleGroups.length && (
          <button
            type="button"
            onClick={() => setShowAllGroups(true)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
          >
            Show all {sortedGroups.length} layers
          </button>
        )}
        {compact && showAllGroups && sortedGroups.length > 4 && (
          <button
            type="button"
            onClick={() => setShowAllGroups(false)}
            className="w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Collapse flow layers
          </button>
        )}
      </div>
      )}
    </motion.div>
  );
}
