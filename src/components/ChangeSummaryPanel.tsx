import { motion } from "framer-motion";
import { AlertTriangle, Code2, TestTube, Layers, TrendingUp, TrendingDown, Minus, Copy, Check } from "lucide-react";
import type { ChangeSummary, MRData } from "../types";
import { DiffViewer, DiffStats } from "./DiffViewer";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

interface ChangeSummaryPanelProps {
  summary: ChangeSummary;
  mrData: MRData;
  scrollToFile?: string | null;
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  feature: "bg-accent/10 text-accent border-accent/20",
  bugfix: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  refactor: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  chore: "bg-muted text-muted-foreground border-border",
  docs: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
  test: "bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  perf: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  security: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  breaking: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
};

const IMPACT_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  high: { icon: TrendingUp, color: "text-destructive", label: "High" },
  medium: { icon: Minus, color: "text-yellow-500", label: "Medium" },
  low: { icon: TrendingDown, color: "text-accent", label: "Low" },
};

function ImpactBadge({ impact }: { impact: string }) {
  const config = IMPACT_CONFIG[impact] ?? IMPACT_CONFIG.medium;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}>
      <Icon size={11} />
      {config.label}
    </span>
  );
}

export function ChangeSummaryPanel({ summary, mrData, scrollToFile }: ChangeSummaryPanelProps) {
  const [showAllDiffs, setShowAllDiffs] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-expand all diffs when navigating to a specific file
  useEffect(() => {
    if (scrollToFile && mrData.files.length > 5) {
      const idx = mrData.files.findIndex((f) => f.filename === scrollToFile);
      if (idx >= 5) {
        setShowAllDiffs(true);
      }
    }
  }, [scrollToFile, mrData.files]);

  const displayedFiles = showAllDiffs ? mrData.files : mrData.files.slice(0, 5);

  const copySummary = () => {
    const text = [
      `# Change Summary: ${summary.purpose}`,
      ``,
      `**Type:** ${summary.changeType} | **Scope:** ${summary.scope}`,
      summary.breakingChanges ? `**⚠️ Breaking Changes:** ${summary.breakingChangesDescription}` : "",
      ``,
      `## Summary`,
      summary.summary,
      ``,
      `## Key Changes`,
      ...summary.keyChanges.map((c) => `- **${c.area}** (${c.impact}): ${c.description}`),
      ``,
      `## Technologies`,
      summary.techStack.join(", "),
      ``,
      `## Testing`,
      summary.testingStatus,
      ``,
      `## Stats`,
      `${mrData.pr.changedFiles} files changed, +${mrData.pr.additions}/-${mrData.pr.deletions} lines, ${mrData.pr.commits} commit(s)`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Summary copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Overview Card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${CHANGE_TYPE_COLORS[summary.changeType] ?? CHANGE_TYPE_COLORS.chore}`}>
                {summary.changeType}
              </span>
              {summary.breakingChanges && (
                <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                  <AlertTriangle size={11} />
                  Breaking Change
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers size={11} />
                {summary.scope}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">{summary.purpose}</h2>
          </div>
          <button
            onClick={copySummary}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card flex-shrink-0"
          >
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{summary.summary}</p>

        {summary.breakingChanges && summary.breakingChangesDescription && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/20 bg-destructive/5 mb-4">
            <AlertTriangle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Breaking Changes</p>
              <p className="text-sm text-foreground mt-0.5">{summary.breakingChangesDescription}</p>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-border">
          <DiffStats
            additions={mrData.pr.additions}
            deletions={mrData.pr.deletions}
            changedFiles={mrData.pr.changedFiles}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{mrData.pr.commits} commit{mrData.pr.commits !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{mrData.pr.baseBranch} ← {mrData.pr.headBranch}</span>
          </div>
        </div>
      </div>

      {/* Key Changes */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Layers size={15} />
          Key Changes by Area
        </h3>
        <div className="space-y-3">
          {summary.keyChanges.map((change, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">{change.area}</span>
                  <ImpactBadge impact={change.impact} />
                </div>
                <p className="text-sm text-muted-foreground">{change.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tech Stack & Testing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Code2 size={15} />
            Technologies
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.techStack.map((tech) => (
              <span key={tech} className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border text-muted-foreground font-medium">
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TestTube size={15} />
            Testing Status
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{summary.testingStatus}</p>
        </div>
      </div>

      {/* File Diffs */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Changed Files ({mrData.files.length})
        </h3>
        <div className="space-y-2">
          {displayedFiles.map((file, i) => (
            <DiffViewer key={file.filename} file={file} defaultOpen={i === 0 && mrData.files.length <= 3} />
          ))}
        </div>
        {mrData.files.length > 5 && (
          <button
            onClick={() => setShowAllDiffs(!showAllDiffs)}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center py-2 rounded-xl hover:bg-secondary"
          >
            {showAllDiffs ? "Show fewer files" : `Show ${mrData.files.length - 5} more files`}
          </button>
        )}
      </div>
    </motion.div>
  );
}
