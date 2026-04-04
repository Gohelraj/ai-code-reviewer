import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { GitPullRequest, Search, ArrowLeft, ExternalLink, Cpu, Play, ListChecks, FileEdit, X, Clock, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import type { AnalysisState } from "../types";
import { ChangeSummaryPanel } from "./ChangeSummaryPanel";
import { ExecutionFlowPanel } from "./ExecutionFlowPanel";
import { CodeReviewPanel } from "./CodeReviewPanel";
import { RequirementsPanel } from "./RequirementsPanel";
import { MRDescriptionPanel } from "./MRDescriptionPanel";
import { NavigationSidebar } from "./NavigationSidebar";
import { ReviewModePicker } from "./ReviewModePicker";
import { SummarySkeleton, FlowSkeleton } from "./Skeleton";
import type { AIConfig, ReviewMode } from "./AISettings";
import { OPENROUTER_MODELS } from "./AISettings";
import { ThemeToggle } from "./ThemeToggle";
import { AISettings } from "./AISettings";
import { RepoContextSettings } from "./RepoContextSettings";
import { ResultViewToggle, type ResultViewMode } from "./ResultViewToggle";
import { exportAsMarkdown, downloadMarkdown, exportAsJSON, downloadJSON } from "../lib/export";
import { estimateAnalysisCost, formatCost } from "../lib/cost";
import { getHistory } from "../lib/history";
import type { HistoryEntry } from "../lib/history";
import { formatDistanceToNow } from "date-fns";
import { getRepoKeyFromUrl } from "../lib/review-utils";

interface ResultsDashboardProps {
  state: AnalysisState;
  onReset: () => void;
  onTabChange: (tab: "summary" | "flow" | "review" | "requirements" | "mr-description") => void;
  aiConfig?: AIConfig | null;
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  reviewLoading: boolean;
  flowLoading: boolean;
  reqLoading: boolean;
  mrDescLoading: boolean;
  onTriggerFlow: () => void;
  onRefresh: () => void;
  onTriggerReview: (reviewMode?: ReviewMode, options?: { fresh?: boolean }) => void;
  onTriggerRequirements: () => void;
  onTriggerMRDescription: () => void;
  prUrl?: string;
  prToken?: string;
  onNotesChange?: (notes: string) => void;
  onTokenChange?: (token: string) => void;
  onLoadHistory?: (entry: import("../lib/history").HistoryEntry) => void;
  onAIConfigChange?: (config: AIConfig) => void;
  onReviewChatChange?: (messages: AnalysisState["reviewChat"]) => void;
  onSelectedIssueChange?: (selectedIssueId?: string) => void;
  onSelectedFileChange?: (selectedFile?: string) => void;
  loadedFromHistory?: boolean;
  loadedHistoryTimestamp?: number | null;
  onDeleteCurrentReview?: () => Promise<void> | void;
  canDeleteCurrentReview?: boolean;
  onDeleteCurrentMrHistory?: () => Promise<void> | void;
  canDeleteCurrentMrHistory?: boolean;
}

export function ResultsDashboard({ state, onReset, onTabChange, aiConfig, theme, onThemeChange, reviewLoading, flowLoading, reqLoading, mrDescLoading, onTriggerFlow, onRefresh, onTriggerReview, onTriggerRequirements, onTriggerMRDescription, prUrl, prToken, onNotesChange, onTokenChange, onLoadHistory, onAIConfigChange, onReviewChatChange, onSelectedIssueChange, onSelectedFileChange, loadedFromHistory = false, loadedHistoryTimestamp = null, onDeleteCurrentReview, canDeleteCurrentReview = false, onDeleteCurrentMrHistory, canDeleteCurrentMrHistory = false }: ResultsDashboardProps) {
  const { mrData, summary, executionFlow, codeReview, activeTab, requirementsCheck, mrDescriptionReview } = state;
  const [reviewRunMode, setReviewRunMode] = useState<ReviewMode>(aiConfig?.reviewMode ?? "deep");
  const modelLabel = aiConfig?.provider === "openrouter" && aiConfig.apiKey
    ? OPENROUTER_MODELS.find((m) => m.id === aiConfig.model)?.label ?? aiConfig.model
    : null;
  const reviewModeLabel = reviewRunMode === "quick" ? "Quick" : "Deep";

  if (!mrData) return null;

  const effectiveAIConfig = aiConfig ? { ...aiConfig, reviewMode: reviewRunMode } : null;
  const cost = effectiveAIConfig ? estimateAnalysisCost(mrData.files, effectiveAIConfig) : null;

  const issueCount = codeReview?.issues.length ?? 0;
  const criticalCount = codeReview?.issues.filter((i) => i.severity === "critical").length ?? 0;
  const warningCount = codeReview?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const isAnalyzing = state.step !== "done" && state.step !== "error";

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "1":
          if (summary) onTabChange("summary");
          break;
        case "2":
          if (executionFlow || flowLoading || summary) onTabChange("flow");
          break;
        case "3":
          onTabChange("review");
          break;
        case "4":
          if (requirementsCheck || state.linkedIssueUrl) onTabChange("requirements");
          break;
        case "5":
          onTabChange("mr-description");
          break;
        case "r":
        case "R":
          if (activeTab === "review" && !codeReview && !reviewLoading) onTriggerReview(reviewRunMode);
          break;
        case "Escape":
          onReset();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [summary, executionFlow, codeReview, requirementsCheck, mrDescriptionReview, state.linkedIssueUrl, activeTab, reviewLoading, flowLoading, isAnalyzing, onTabChange, onTriggerReview, onReset, reviewRunMode]);

  const handleFileClick = useCallback((filename: string) => {
    onSelectedFileChange?.(filename);
    const tryScroll = () => {
      const el = document.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary/50");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000);
        return true;
      }
      return false;
    };

    // Already visible on current tab
    if (tryScroll()) return;

    // Switch tab + signal the panel to expand all files
    const targetTab = summary ? "summary" : codeReview ? "review" : null;
    if (targetTab) {
      onTabChange(targetTab);
      setScrollToFile(filename);
      const shortName = filename.split("/").pop() ?? filename;
      toast(`Switched to ${targetTab === "summary" ? "Summary" : "Review"} tab for ${shortName}`, { icon: "📄", duration: 2000 });
    }

    // Retry with backoff until the element appears (new tab renders)
    let attempts = 0;
    const retry = () => {
      if (tryScroll()) {
        setScrollToFile(null);
        return;
      }
      attempts++;
      if (attempts < 15) {
        requestAnimationFrame(retry);
      } else {
        setScrollToFile(null);
      }
    };
    requestAnimationFrame(retry);
  }, [summary, codeReview, onTabChange, onSelectedFileChange]);

  const handleExport = useCallback(() => {
    const md = exportAsMarkdown(state);
    downloadMarkdown(md, `review-${mrData.pr.title.slice(0, 30).replace(/\s+/g, "-")}.md`);
  }, [state, mrData]);

  const handleExportJSON = useCallback(() => {
    const json = exportAsJSON(state);
    downloadJSON(json, `review-${mrData.pr.title.slice(0, 30).replace(/\s+/g, "-")}.json`);
  }, [state, mrData]);

  const handleCopyClipboard = useCallback(() => {
    const md = exportAsMarkdown(state);
    navigator.clipboard.writeText(md).then(() => {
      toast.success("Copied review to clipboard");
    }).catch(() => {
      toast.error("Failed to copy");
    });
  }, [state]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [localAIConfig, setLocalAIConfig] = useState<AIConfig | null>(aiConfig ?? null);
  const [scrollToFile, setScrollToFile] = useState<string | null>(state.selectedFile ?? null);
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>(() => {
    try {
      const saved = localStorage.getItem("results-view-mode");
      return saved === "detailed" ? "detailed" : "compact";
    } catch {
      return "compact";
    }
  });
  const repoKey = getRepoKeyFromUrl(prUrl ?? "");

  useEffect(() => {
    if (historyOpen) {
      getHistory().then((entries) => setHistoryEntries(entries.slice(0, 10)));
    }
  }, [historyOpen]);

  useEffect(() => {
    setReviewRunMode(aiConfig?.reviewMode ?? "deep");
  }, [aiConfig?.reviewMode]);

  useEffect(() => {
    setScrollToFile(state.selectedFile ?? null);
  }, [state.selectedFile]);

  useEffect(() => {
    try {
      localStorage.setItem("results-view-mode", resultViewMode);
    } catch {}
  }, [resultViewMode]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Slim Header */}
      <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-sm z-30">
        <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={onReset}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
              title="Back to home"
            >
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <GitPullRequest size={14} className="text-background" />
              </div>
              <span className="font-semibold text-foreground tracking-tight hidden sm:block">AI Code Reviewer</span>
            </button>

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

            {modelLabel && aiConfig?.model && (
              <button
                onClick={() => { setLocalAIConfig(aiConfig); setAiConfigOpen(true); }}
                className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card transition-colors flex-shrink-0"
                title="Change AI model"
              >
                <Cpu size={11} className="text-accent" />
                <span className="font-medium text-foreground">{modelLabel}</span>
                <span className="text-muted-foreground">· {reviewModeLabel}</span>
                <ChevronDown size={10} className="text-muted-foreground" />
              </button>
            )}
            <ResultViewToggle value={resultViewMode} onChange={setResultViewMode} />
            <button
              onClick={onRefresh}
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card transition-colors flex-shrink-0"
              title="Fetch the latest MR/PR snapshot and rerun summary/flow"
            >
              <RefreshCw size={11} className="text-muted-foreground" />
              <span className="font-medium text-foreground">Refresh MR</span>
            </button>
            {onDeleteCurrentReview && (
              <button
                onClick={async () => {
                  if (!canDeleteCurrentReview) return;
                  if (!window.confirm("Delete this saved review permanently? This cannot be undone.")) return;
                  await onDeleteCurrentReview();
                }}
                disabled={!canDeleteCurrentReview}
                className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete the currently open saved review"
              >
                <Trash2 size={11} className="text-muted-foreground" />
                <span className="font-medium text-foreground">Delete Review</span>
              </button>
            )}
            {onDeleteCurrentMrHistory && (
              <button
                onClick={async () => {
                  if (!canDeleteCurrentMrHistory) return;
                  if (!window.confirm("Delete all saved reviews for this MR or PR? This cannot be undone.")) return;
                  await onDeleteCurrentMrHistory();
                }}
                disabled={!canDeleteCurrentMrHistory}
                className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete all saved review history for the current MR or PR"
              >
                <Trash2 size={11} className="text-muted-foreground" />
                <span className="font-medium text-foreground">Delete MR History</span>
              </button>
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
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <NavigationSidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          state={state}
          reviewLoading={reviewLoading}
          flowLoading={flowLoading}
          reqLoading={reqLoading}
          mrDescLoading={mrDescLoading}
          files={mrData.files}
          onFileClick={handleFileClick}
          onExport={handleExport}
          onExportJSON={handleExportJSON}
          onCopyClipboard={handleCopyClipboard}
          onPrint={() => window.print()}
          hasExportData={!!(summary || codeReview)}
          notesValue={state.reviewerNotes ?? ""}
          onNotesChange={(val) => onNotesChange?.(val)}
          onLoadHistory={onLoadHistory ? () => setHistoryOpen(true) : undefined}
          stats={{
            changedFiles: mrData.pr.changedFiles,
            additions: mrData.pr.additions,
            deletions: mrData.pr.deletions,
            commits: mrData.pr.commits,
            score: codeReview?.overallScore,
            issueCount,
            criticalCount,
            warningCount,
              costLabel: cost ? `Start ${formatCost(cost.startCost)} · Review ${formatCost(cost.reviewCost)}` : undefined,
            }}
          />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-20 sm:pb-6">
        {loadedFromHistory && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">Viewing saved analysis</span>
              <span className="text-blue-800/80 dark:text-blue-100/80">
                {loadedHistoryTimestamp
                  ? `from ${formatDistanceToNow(loadedHistoryTimestamp, { addSuffix: true })}`
                  : "from an earlier run"}
              </span>
              <span className="text-blue-800/80 dark:text-blue-100/80">Use `Refresh MR` to fetch the latest changes.</span>
            </div>
          </div>
        )}
        {activeTab === "summary" && summary && (
          <ChangeSummaryPanel summary={summary} mrData={mrData} scrollToFile={scrollToFile} viewMode={resultViewMode} />
        )}
        {activeTab === "summary" && !summary && isAnalyzing && (
          <SummarySkeleton />
        )}
        {activeTab === "flow" && executionFlow && (
          <ExecutionFlowPanel flow={executionFlow} mrData={mrData} viewMode={resultViewMode} />
        )}
        {activeTab === "flow" && !executionFlow && flowLoading && (
          <FlowSkeleton />
        )}
        {activeTab === "flow" && !executionFlow && !flowLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
              <GitPullRequest size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Execution Flow</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Generate the architectural flow only when you need it. This saves one AI call during the initial analysis.
            </p>
            <button
              onClick={onTriggerFlow}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
            >
              <Play size={14} />
              Generate Execution Flow
            </button>
          </motion.div>
        )}
        {activeTab === "review" && codeReview && (
          <CodeReviewPanel
            review={codeReview}
            prUrl={prUrl}
            prToken={prToken}
            mrData={mrData}
            previousReview={state.previousReview}
            previousReviewMeta={state.previousReviewMeta}
            reviewLoading={reviewLoading}
            onTriggerReview={onTriggerReview}
            reviewMode={reviewRunMode}
            onReviewModeChange={setReviewRunMode}
            onTokenChange={onTokenChange}
            postingMode={aiConfig?.postingMode}
            selectedIssueId={state.selectedIssueId}
            selectedFile={state.selectedFile}
            onSelectedIssueChange={onSelectedIssueChange}
            onSelectedFileChange={onSelectedFileChange}
            reviewChat={state.reviewChat ?? []}
            onReviewChatChange={onReviewChatChange}
            aiConfig={aiConfig ?? null}
            requirementsCheck={requirementsCheck}
            mrDescriptionReview={mrDescriptionReview}
          />
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
              {reviewRunMode === "quick"
                ? "Run a faster, lower-cost review focused on the highest-signal issues first."
                : "Run an in-depth senior-level code review powered by AI. This will analyze code quality, security, performance, and architecture."}
            </p>
            <div className="w-full max-w-md mb-5 text-left">
              <ReviewModePicker value={reviewRunMode} onChange={setReviewRunMode} disabled={reviewLoading} />
            </div>
            <button
              onClick={() => onTriggerReview(reviewRunMode)}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
            >
              <Play size={14} />
              {reviewRunMode === "quick" ? "Run Quick Review" : "Run Deep Review"}
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
              <span className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Reviewing Code...</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              {reviewRunMode === "quick"
                ? "Running a faster high-signal review. This should return sooner and use less context."
                : "Performing a comprehensive senior-level code review. This typically takes 15–30 seconds."}
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
        {activeTab === "requirements" && requirementsCheck && (
          <RequirementsPanel check={requirementsCheck} issueUrl={state.linkedIssueUrl} viewMode={resultViewMode} />
        )}
        {activeTab === "requirements" && !requirementsCheck && !reqLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
              <ListChecks size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Requirements Check</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
              {state.linkedIssueUrl
                ? "Cross-check MR changes against the linked issue to verify all requirements are fulfilled."
                : "No issue linked. Go back and add an issue URL to enable requirements checking."}
            </p>
            {state.linkedIssueUrl && (
              <button
                onClick={onTriggerRequirements}
                className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
              >
                <Play size={14} />
                Run Requirements Check
              </button>
            )}
          </motion.div>
        )}
        {activeTab === "requirements" && !requirementsCheck && reqLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <span className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Checking Requirements...</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Cross-checking MR changes against issue requirements.
            </p>
          </motion.div>
        )}
        {activeTab === "mr-description" && mrDescriptionReview && (
          <MRDescriptionPanel review={mrDescriptionReview} currentDescription={mrData.pr.description} viewMode={resultViewMode} />
        )}
        {activeTab === "mr-description" && !mrDescriptionReview && !mrDescLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
              <FileEdit size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">MR Description Review</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Analyze MR description quality and get AI suggestions for improvement.
            </p>
            <button
              onClick={onTriggerMRDescription}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
            >
              <Play size={14} />
              Review Description
            </button>
          </motion.div>
        )}
        {activeTab === "mr-description" && !mrDescriptionReview && mrDescLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <span className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Reviewing Description...</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Analyzing MR description quality and generating suggestions.
            </p>
          </motion.div>
        )}
        {!summary && !executionFlow && !codeReview && activeTab !== "review" && activeTab !== "requirements" && activeTab !== "mr-description" && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              <span className="text-sm">Analysis in progress...</span>
            </div>
          </div>
        )}
          </div>
        </main>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Recent Reviews</h3>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {historyEntries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No past reviews found.</p>
              )}
              {historyEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    onLoadHistory?.(entry);
                    setHistoryOpen(false);
                  }}
                  className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.prTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.url.includes("github") ? "GitHub" : "GitLab"} · {entry.model} · {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Config modal */}
      {aiConfigOpen && localAIConfig && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setAiConfigOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-accent" />
                <h3 className="text-sm font-semibold text-foreground">AI Model Settings</h3>
              </div>
              <button onClick={() => setAiConfigOpen(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              <div className="space-y-4">
                <RepoContextSettings
                  config={localAIConfig}
                  onChange={setLocalAIConfig}
                  repoUrl={prUrl}
                  repoToken={prToken}
                  mrData={mrData}
                />
                <AISettings config={localAIConfig} onChange={setLocalAIConfig} repoKey={repoKey} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border bg-secondary/30">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {localAIConfig.model !== aiConfig?.model
                  ? "Model changed — re-run any analysis to use the new model."
                  : "Change the model or API key, then re-run analysis."}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setAiConfigOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onAIConfigChange?.(localAIConfig);
                    setAiConfigOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors"
                >
                  <RefreshCw size={11} />
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
