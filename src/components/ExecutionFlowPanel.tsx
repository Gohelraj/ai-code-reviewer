import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ChevronDown, ChevronUp, ExternalLink, GitCommitHorizontal, Network } from "lucide-react";
import type { ExecutionFlow, FlowGroup, MRData } from "../types";
import { DiffViewer } from "./DiffViewer";

interface ExecutionFlowPanelProps {
  flow: ExecutionFlow;
  mrData: MRData;
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

function FlowGroupCard({ group, mrData, index }: { group: FlowGroup; mrData: MRData; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const style = getLayerStyle(group.layer);

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
                <div key={file.filename} className="rounded-xl border border-border bg-card overflow-hidden">
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
                        <p className="text-sm text-foreground leading-relaxed">{file.keyChanges}</p>
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

export function ExecutionFlowPanel({ flow, mrData }: ExecutionFlowPanelProps) {
  const sortedGroups = [...flow.flowGroups].sort((a, b) => a.order - b.order);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Overview */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Network size={15} />
          Execution Flow Overview
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{flow.flowDescription}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entry Point</p>
            <p className="text-sm font-mono font-medium text-foreground">{flow.entryPoint}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Data Flow</p>
            <p className="text-sm text-foreground leading-relaxed">{flow.dataFlow}</p>
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

      {/* Flow groups */}
      <div className="space-y-3">
        {sortedGroups.map((group, i) => (
          <div key={group.layer} className="relative">
            <FlowGroupCard group={group} mrData={mrData} index={i} />
            {i < sortedGroups.length - 1 && (
              <div className="flex justify-center my-1">
                <ArrowDown size={16} className="text-muted-foreground/40" />
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
