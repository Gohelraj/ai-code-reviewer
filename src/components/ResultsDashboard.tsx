import { motion } from "framer-motion";
import { GitPullRequest, FileText, GitBranch, Search, ArrowLeft, ExternalLink, Cpu, Play } from "lucide-react";
import type { AnalysisState } from "../types";
import { ChangeSummaryPanel } from "./ChangeSummaryPanel";
import { ExecutionFlowPanel } from "./ExecutionFlowPanel";
import { CodeReviewPanel } from "./CodeReviewPanel";
import type { AIConfig } from "./AISettings";
import { OPENROUTER_MODELS } from "./AISettings";
import { ThemeToggle } from "./ThemeToggle";

interface ResultsDashboardProps {
  state: AnalysisState;
  onReset: () => void;
  onTabChange: (tab: "summary" | "flow" | "review") => void;
  aiConfig?: AIConfig | null;
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  reviewLoading: boolean;
  onTriggerReview: () => void;
}

const TABS = [
  { id: "summary" as const, label: "Change Summary", icon: FileText, description: "What changed and why" },
  { id: "flow" as const, label: "Execution Flow", icon: GitBranch, description: "Architectural layers" },
  { id: "review" as const, label: "Code Review", icon: Search, description: "Senior engineer insights" },
];

export function ResultsDashboard({ state, onReset, onTabChange, aiConfig, theme, onThemeChange, reviewLoading, onTriggerReview }: ResultsDashboardProps) {
  const { mrData, summary, executionFlow, codeReview, activeTab } = state;
  const modelLabel = aiConfig?.provider === "openrouter" && aiConfig.apiKey
    ? OPENROUTER_MODELS.find((m) => m.id === aiConfig.model)?.label ?? aiConfig.model
    : null;

  if (!mrData) return null;

  const issueCount = codeReview?.issues.length ?? 0;
  const criticalCount = codeReview?.issues.filter((i) => i.severity === "critical").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
              <GitPullRequest size={14} className="text-background" />
            </div>
            <span className="font-semibold text-foreground tracking-tight hidden sm:block">MergeAI Reviewer</span>

            <div className="flex-1 min-w-0 mx-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
                  {mrData.platform === "github" ? "GitHub" : "GitLab"} ·
                </span>
                <p className="text-sm font-medium text-foreground truncate">{mrData.pr.title}</p>
                <a
                  href={mrData.pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>

            {modelLabel && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary flex-shrink-0">
                <Cpu size={11} className="text-accent" />
                <span className="font-medium text-foreground">{modelLabel}</span>
              </div>
            )}
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card flex-shrink-0"
            >
              <ArrowLeft size={12} />
              <span className="hidden sm:block">New Analysis</span>
              <span className="sm:hidden">Back</span>
            </button>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 pb-0 -mb-px overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isReviewTab = tab.id === "review";
              const isAvailable = tab.id === "summary" ? !!summary : tab.id === "flow" ? !!executionFlow : !!codeReview;
              const isReviewPending = isReviewTab && !codeReview && !reviewLoading;
              const isReviewRunning = isReviewTab && reviewLoading;
              const canClick = isAvailable || isReviewPending;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (isAvailable) {
                      onTabChange(tab.id);
                    } else if (isReviewPending) {
                      onTabChange(tab.id);
                    }
                  }}
                  disabled={!canClick && !isReviewRunning}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 flex-shrink-0 ${
                    isActive
                      ? "text-foreground border-foreground"
                      : canClick || isReviewRunning
                      ? "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                      : "text-muted-foreground/40 border-transparent cursor-not-allowed"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {isReviewTab && criticalCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-destructive text-background text-xs flex items-center justify-center font-bold">
                      {criticalCount}
                    </span>
                  )}
                  {isReviewTab && criticalCount === 0 && issueCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-yellow-500 text-background text-xs flex items-center justify-center font-bold">
                      {issueCount}
                    </span>
                  )}
                  {isReviewRunning && (
                    <span className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
                  )}
                  {isReviewPending && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">New</span>
                  )}
                  {!isAvailable && !isReviewTab && (
                    <motion.span
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "summary" && summary && (
          <ChangeSummaryPanel summary={summary} mrData={mrData} />
        )}
        {activeTab === "flow" && executionFlow && (
          <ExecutionFlowPanel flow={executionFlow} mrData={mrData} />
        )}
        {activeTab === "review" && codeReview && (
          <CodeReviewPanel review={codeReview} />
        )}
        {activeTab === "review" && !codeReview && !reviewLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
              <Search size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Code Review</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Run an in-depth senior-level code review powered by AI. This will analyze code quality, security, performance, and architecture.
            </p>
            <button
              onClick={onTriggerReview}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
            >
              <Play size={14} />
              Run Code Review
            </button>
          </motion.div>
        )}
        {activeTab === "review" && !codeReview && reviewLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <span className="w-8 h-8 border-3 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Reviewing Code...</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Performing a comprehensive senior-level code review. This typically takes 15–30 seconds.
            </p>
            <div className="mt-6 w-64 h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "90%" }}
                transition={{ duration: 25, ease: "linear" }}
              />
            </div>
          </motion.div>
        )}
        {!summary && !executionFlow && !codeReview && activeTab !== "review" && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              <span className="text-sm">Analysis in progress...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
