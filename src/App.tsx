import { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { InputForm } from "./components/InputForm";
import type { SubmitPayload } from "./components/InputForm";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { fetchMRDiff, analyzeSummary, analyzeExecutionFlow, analyzeCodeReview, fetchIssueData, analyzeRequirements, analyzeMRDescription, prepareMRDataForReview } from "./lib/api";
import type { IssueData } from "./lib/api";
import { clearAnalysisHistory, deleteAnalysesForUrl, deleteAnalysis, getLatestHistoryForUrl, getLatestReviewHistoryForUrl, saveAnalysis } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import type { AnalysisState } from "./types";
import type { AIConfig, ReviewMode } from "./components/AISettings";
import { loadRepoDefaults, sanitizeAIConfig, saveAIConfig, saveRepoDefaults } from "./components/AISettings";
import { useDarkMode } from "./lib/useDarkMode";
import { computeReviewDiff, getRepoKeyFromUrl, readUiStateFromLocation, writeUiStateToLocation } from "./lib/review-utils";

function createInitialState(): AnalysisState {
  const locationState = typeof window !== "undefined" ? readUiStateFromLocation() : {};
  return {
    step: "idle",
    mrData: null,
    summary: null,
    executionFlow: null,
    codeReview: null,
    error: null,
    activeTab: locationState.activeTab ?? "summary",
    reviewChat: [],
    selectedFile: locationState.selectedFile,
    selectedIssueId: locationState.selectedIssueId,
  };
}

function App() {
  const [state, setState] = useState<AnalysisState>(createInitialState);
  const [activeAIConfig, setActiveAIConfig] = useState<AIConfig | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);
  const [mrDescLoading, setMrDescLoading] = useState(false);
  const [analysisUrl, setAnalysisUrl] = useState("");
  const [analysisToken, setAnalysisToken] = useState<string | undefined>(undefined);
  const [issueData, setIssueData] = useState<IssueData | null>(null);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [loadedHistoryTimestamp, setLoadedHistoryTimestamp] = useState<number | null>(null);
  const [currentHistoryEntryId, setCurrentHistoryEntryId] = useState<string | null>(null);
  const { theme, setTheme } = useDarkMode();

  const rememberSavedEntry = useCallback((entry: HistoryEntry | null) => {
    if (entry) {
      setCurrentHistoryEntryId(entry.id);
    }
  }, []);

  const updateState = useCallback((patch: Partial<AnalysisState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (state.step === "idle") return;
    writeUiStateToLocation({
      activeTab: state.activeTab,
      selectedFile: state.selectedFile,
      selectedIssueId: state.selectedIssueId,
    });
  }, [state.step, state.activeTab, state.selectedFile, state.selectedIssueId]);

  const handleAnalyze = useCallback(async ({ url, token, aiConfig, issueUrl, forceRefresh = false }: SubmitPayload) => {
    const normalizedConfig = sanitizeAIConfig(aiConfig);
    const repoDefaults = loadRepoDefaults(getRepoKeyFromUrl(url));
    const normalizedIssueUrl = issueUrl?.trim() || undefined;
    setState({
      ...createInitialState(),
      step: "fetching",
      activeTab: repoDefaults?.defaultTab ?? "summary",
      reviewChat: [],
    });
    setActiveAIConfig(normalizedConfig);
    setFlowLoading(false);
    setAnalysisUrl(url);
    setAnalysisToken(token);
    setIssueData(null);
    setLoadedFromHistory(false);
    setLoadedHistoryTimestamp(null);
    setCurrentHistoryEntryId(null);

    try {
      if (!forceRefresh) {
        const existingEntry = await getLatestHistoryForUrl(url);
        if (existingEntry && (existingEntry.state.linkedIssueUrl ?? undefined) === normalizedIssueUrl) {
          setState(existingEntry.state);
          setActiveAIConfig(sanitizeAIConfig(existingEntry.aiConfig));
          setAnalysisUrl(url);
          setAnalysisToken(token);
          writeUiStateToLocation({
            activeTab: existingEntry.state.activeTab,
            selectedFile: existingEntry.state.selectedFile,
            selectedIssueId: existingEntry.state.selectedIssueId,
          });
          setLoadedFromHistory(true);
          setLoadedHistoryTimestamp(existingEntry.timestamp);
          setCurrentHistoryEntryId(existingEntry.id);
          toast.success("Loaded saved analysis. Use Refresh MR to fetch the latest changes.");
          return;
        }
      }

      // Step 1: Fetch diff + optional issue data
      const mrDataPromise = fetchMRDiff(url, token);
      const previousReviewEntryPromise = getLatestReviewHistoryForUrl(url);
      const issuePromise = normalizedIssueUrl
        ? fetchIssueData(normalizedIssueUrl, token).catch((err) => {
            toast.error(`Issue fetch failed: ${err instanceof Error ? err.message : "Unknown"}`);
            return null;
          })
        : Promise.resolve(null);

      const [mrData, issue, previousReviewEntry] = await Promise.all([mrDataPromise, issuePromise, previousReviewEntryPromise]);
      if (issue) setIssueData(issue);
      const previousReview = previousReviewEntry?.state.codeReview ?? null;
      const previousCommits = previousReviewEntry?.state.mrData?.pr.commits ?? 0;
      updateState({
        step: "summarizing",
        mrData,
        linkedIssueUrl: normalizedIssueUrl,
        previousReview,
        previousReviewMeta: previousReview
          ? {
              source: "history",
              previousCommits,
              commitDelta: Math.max(mrData.pr.commits - previousCommits, 0),
              timestamp: previousReviewEntry?.timestamp,
            }
          : null,
      });

      // Step 2: Summarize + flow in parallel (requirements & MR desc are manual)
      updateState({ step: "summarizing" });
      const summaryPromise = analyzeSummary(mrData, normalizedConfig).then((summary) => {
        updateState({ summary, activeTab: "summary" });
        return summary;
      });

      if ((normalizedConfig.analysisStartMode ?? "summary-and-flow") === "summary-and-flow") {
        updateState({ step: "flowing" });
        setFlowLoading(true);
        const flowPromise = analyzeExecutionFlow(mrData, normalizedConfig).then((executionFlow) => {
          updateState({ executionFlow });
          return executionFlow;
        }).finally(() => {
          setFlowLoading(false);
        });

        await Promise.all([summaryPromise, flowPromise]);
      } else {
        await summaryPromise;
      }

      // Done — code review is triggered manually by the user
      updateState({ step: "done" });
      toast.success("Analysis complete!");

      // Save to history
      // We need to get the latest state, so use a callback
      setState((prev) => {
        void saveAnalysis(url, prev, normalizedConfig).then(rememberSavedEntry);
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unexpected error occurred";
      updateState({ step: "error", error });
      toast.error(error);
    }
  }, [updateState]);

  const handleRefreshAnalysis = useCallback(async () => {
    if (!analysisUrl || !activeAIConfig) return;
    await handleAnalyze({
      url: analysisUrl,
      token: analysisToken,
      aiConfig: activeAIConfig,
      issueUrl: state.linkedIssueUrl,
      forceRefresh: true,
    });
  }, [analysisUrl, analysisToken, activeAIConfig, state.linkedIssueUrl, handleAnalyze]);

  const handleReset = useCallback(() => {
    setState(createInitialState());
    setActiveAIConfig(null);
    setReviewLoading(false);
    setFlowLoading(false);
    setReqLoading(false);
    setMrDescLoading(false);
    setAnalysisUrl("");
    setAnalysisToken(undefined);
    setIssueData(null);
    setLoadedFromHistory(false);
    setLoadedHistoryTimestamp(null);
    setCurrentHistoryEntryId(null);
  }, []);

  const handleLoadHistory = useCallback((entry: HistoryEntry) => {
    setState({ ...entry.state, activeTab: "summary" });
    setActiveAIConfig(sanitizeAIConfig(entry.aiConfig));
    setAnalysisUrl(entry.url);
    setReviewLoading(false);
    setFlowLoading(false);
    setLoadedFromHistory(true);
    setLoadedHistoryTimestamp(entry.timestamp);
    writeUiStateToLocation({
      activeTab: "summary",
      selectedFile: entry.state.selectedFile,
      selectedIssueId: entry.state.selectedIssueId,
    });
    setCurrentHistoryEntryId(entry.id);
  }, []);

  const handleDeleteCurrentReview = useCallback(async () => {
    if (!currentHistoryEntryId) {
      toast.error("This review is not saved yet.");
      return;
    }
    const deleted = await deleteAnalysis(currentHistoryEntryId);
    if (!deleted) {
      toast.error("Could not delete the current saved review.");
      return;
    }
    toast.success("Deleted the current saved review.");
    handleReset();
  }, [currentHistoryEntryId, handleReset]);

  const handleClearAllHistory = useCallback(async () => {
    const cleared = await clearAnalysisHistory();
    if (!cleared) {
      toast.error("Could not clear saved review history.");
      return;
    }
    setCurrentHistoryEntryId(null);
    setLoadedFromHistory(false);
    setLoadedHistoryTimestamp(null);
    toast.success("Cleared all saved review history.");
  }, []);

  const handleDeleteCurrentMrHistory = useCallback(async () => {
    if (!analysisUrl) {
      toast.error("No MR or PR is currently loaded.");
      return;
    }
    const deletedCount = await deleteAnalysesForUrl(analysisUrl);
    if (deletedCount === 0) {
      toast.error("No saved reviews were found for this MR.");
      return;
    }
    setCurrentHistoryEntryId(null);
    setLoadedFromHistory(false);
    setLoadedHistoryTimestamp(null);
    toast.success(`Deleted ${deletedCount} saved review${deletedCount === 1 ? "" : "s"} for this MR.`);
    handleReset();
  }, [analysisUrl, handleReset]);

  const handleTabChange = useCallback((tab: "summary" | "flow" | "review" | "requirements" | "mr-description") => {
    updateState({ activeTab: tab });
    const repoKey = getRepoKeyFromUrl(analysisUrl);
    if (repoKey) {
      saveRepoDefaults(repoKey, { defaultTab: tab });
    }
  }, [updateState, analysisUrl]);

  const handleNotesChange = useCallback((notes: string) => {
    updateState({ reviewerNotes: notes });
    // Re-save to history
    setState((prev) => {
      const updated = { ...prev, reviewerNotes: notes };
      if (analysisUrl && activeAIConfig) {
        void saveAnalysis(analysisUrl, updated, activeAIConfig).then(rememberSavedEntry);
      }
      return updated;
    });
  }, [updateState, analysisUrl, activeAIConfig, rememberSavedEntry]);

  const handleTokenChange = useCallback((token: string) => {
    setAnalysisToken(token);
  }, []);

  const handleAIConfigChange = useCallback((config: AIConfig) => {
    const normalizedConfig = sanitizeAIConfig(config);
    setActiveAIConfig(normalizedConfig);
    saveAIConfig(normalizedConfig);
    const repoKey = getRepoKeyFromUrl(analysisUrl);
    if (repoKey) {
      saveRepoDefaults(repoKey, {
        model: normalizedConfig.model,
        auxiliaryModel: normalizedConfig.auxiliaryModel ?? "",
        customRules: normalizedConfig.customRules ?? "",
        repoMemory: normalizedConfig.repoMemory ?? "",
        postingMode: normalizedConfig.postingMode ?? "inline",
        analysisStartMode: normalizedConfig.analysisStartMode ?? "summary-and-flow",
        reviewMode: normalizedConfig.reviewMode ?? "deep",
        lastPresetId: normalizedConfig.lastPresetId,
      });
    }
  }, [analysisUrl]);

  const handleTriggerFlow = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || flowLoading) return;
    setFlowLoading(true);
    try {
      const executionFlow = await analyzeExecutionFlow(state.mrData, activeAIConfig);
      updateState({ executionFlow, activeTab: "flow" });
      toast.success("Execution flow complete!");
      setState((prev) => {
        if (analysisUrl && activeAIConfig) {
          void saveAnalysis(analysisUrl, prev, activeAIConfig).then(rememberSavedEntry);
        }
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Execution flow failed";
      updateState({ error });
      toast.error(error);
    } finally {
      setFlowLoading(false);
    }
  }, [state.mrData, activeAIConfig, flowLoading, updateState, analysisUrl, rememberSavedEntry]);

  const handleTriggerReview = useCallback(async (reviewModeOverride?: ReviewMode, options?: { fresh?: boolean }) => {
    if (!state.mrData || !activeAIConfig || reviewLoading) return;
    setReviewLoading(true);
    const reviewConfig: AIConfig = {
      ...activeAIConfig,
      reviewMode: reviewModeOverride ?? activeAIConfig.reviewMode ?? "deep",
    };
    const useFreshBaseline = options?.fresh === true;
    const baselineReview = useFreshBaseline ? null : (state.codeReview ?? state.previousReview ?? null);
    const baselineMeta = useFreshBaseline
      ? null
      : state.codeReview
      ? {
          source: "rerun" as const,
          previousCommits: state.mrData.pr.commits,
          commitDelta: 0,
        }
      : state.previousReviewMeta ?? null;

    try {
      const preparedMRData = await prepareMRDataForReview(state.mrData, reviewConfig, analysisToken);
      const codeReview = await analyzeCodeReview(preparedMRData, reviewConfig, analysisToken);
      codeReview.reviewDiff = computeReviewDiff(baselineReview, codeReview);
      updateState({
        mrData: preparedMRData,
        codeReview,
        previousReview: baselineReview,
        previousReviewMeta: baselineMeta,
        activeTab: "review",
        selectedIssueId: state.selectedIssueId && codeReview.issues.some((issue) => issue.id === state.selectedIssueId)
          ? state.selectedIssueId
          : codeReview.issues[0]?.id,
      });
      toast.success("Code review complete!");

      // Update history with review
      setState((prev) => {
        if (analysisUrl) {
          void saveAnalysis(analysisUrl, prev, reviewConfig).then(rememberSavedEntry);
        }
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Code review failed";
      updateState({ error });
      toast.error(error);
    } finally {
      setReviewLoading(false);
    }
  }, [state.mrData, state.codeReview, state.previousReview, state.previousReviewMeta, state.selectedIssueId, activeAIConfig, reviewLoading, updateState, analysisToken, analysisUrl, rememberSavedEntry]);

  const handleReviewChatChange = useCallback((messages: AnalysisState["reviewChat"]) => {
    updateState({ reviewChat: messages });
    setState((prev) => {
      const updated = { ...prev, reviewChat: messages };
      if (analysisUrl && activeAIConfig) {
        void saveAnalysis(analysisUrl, updated, activeAIConfig).then(rememberSavedEntry);
      }
      return updated;
    });
  }, [updateState, analysisUrl, activeAIConfig, rememberSavedEntry]);

  const handleSelectedIssueChange = useCallback((selectedIssueId?: string) => {
    updateState({ selectedIssueId });
  }, [updateState]);

  const handleSelectedFileChange = useCallback((selectedFile?: string) => {
    updateState({ selectedFile });
  }, [updateState]);

  const handleTriggerRequirements = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || !issueData || reqLoading) return;
    setReqLoading(true);
    try {
      const requirementsCheck = await analyzeRequirements(state.mrData, issueData, activeAIConfig);
      updateState({ requirementsCheck });
      toast.success("Requirements check complete!");
      setState((prev) => {
        if (analysisUrl && activeAIConfig) {
          void saveAnalysis(analysisUrl, prev, activeAIConfig).then(rememberSavedEntry);
        }
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Requirements check failed";
      toast.error(error);
    } finally {
      setReqLoading(false);
    }
  }, [state.mrData, activeAIConfig, issueData, reqLoading, updateState, analysisUrl, rememberSavedEntry]);

  const handleTriggerMRDescription = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || mrDescLoading) return;
    setMrDescLoading(true);
    try {
      const mrDescriptionReview = await analyzeMRDescription(state.mrData, activeAIConfig, issueData);
      updateState({ mrDescriptionReview });
      toast.success("MR description review complete!");
      setState((prev) => {
        if (analysisUrl && activeAIConfig) {
          void saveAnalysis(analysisUrl, prev, activeAIConfig).then(rememberSavedEntry);
        }
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "MR description review failed";
      toast.error(error);
    } finally {
      setMrDescLoading(false);
    }
  }, [state.mrData, activeAIConfig, issueData, mrDescLoading, updateState, analysisUrl, rememberSavedEntry]);

  // Show input form
  if (state.step === "idle") {
    return (
      <InputForm
        onSubmit={handleAnalyze}
        isLoading={false}
        theme={theme}
        onThemeChange={setTheme}
        onLoadHistory={handleLoadHistory}
        onClearHistory={handleClearAllHistory}
      />
    );
  }

  // Show analysis in progress or error
  if (state.step !== "done" || (!state.summary && !state.executionFlow && !state.codeReview)) {
    // If we have some results, show dashboard while rest loads
    if (state.mrData && (state.summary || state.executionFlow || state.codeReview)) {
      return (
        <ResultsDashboard
          state={state}
          onReset={handleReset}
          onTabChange={handleTabChange}
          aiConfig={activeAIConfig}
          theme={theme}
          onThemeChange={setTheme}
          reviewLoading={reviewLoading}
          flowLoading={flowLoading}
          reqLoading={reqLoading}
          mrDescLoading={mrDescLoading}
          onTriggerFlow={handleTriggerFlow}
          onRefresh={handleRefreshAnalysis}
          onTriggerReview={handleTriggerReview}
          onTriggerRequirements={handleTriggerRequirements}
          onTriggerMRDescription={handleTriggerMRDescription}
          prUrl={analysisUrl}
          prToken={analysisToken}
          onNotesChange={handleNotesChange}
          onTokenChange={handleTokenChange}
          onLoadHistory={handleLoadHistory}
          onAIConfigChange={handleAIConfigChange}
          onReviewChatChange={handleReviewChatChange}
          onSelectedIssueChange={handleSelectedIssueChange}
          onSelectedFileChange={handleSelectedFileChange}
          loadedFromHistory={loadedFromHistory}
          loadedHistoryTimestamp={loadedHistoryTimestamp}
          onDeleteCurrentReview={handleDeleteCurrentReview}
          canDeleteCurrentReview={!!currentHistoryEntryId}
          onDeleteCurrentMrHistory={handleDeleteCurrentMrHistory}
          canDeleteCurrentMrHistory={!!analysisUrl}
        />
      );
    }

    return (
      <AnalysisProgress
        step={state.step}
        prTitle={state.mrData?.pr.title}
        error={state.error}
        onReset={handleReset}
        aiConfig={activeAIConfig}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  // Show full results
  return (
    <ResultsDashboard
      state={state}
      onReset={handleReset}
      onTabChange={handleTabChange}
      aiConfig={activeAIConfig}
      theme={theme}
      onThemeChange={setTheme}
      reviewLoading={reviewLoading}
      flowLoading={flowLoading}
      reqLoading={reqLoading}
      mrDescLoading={mrDescLoading}
      onTriggerFlow={handleTriggerFlow}
      onRefresh={handleRefreshAnalysis}
      onTriggerReview={handleTriggerReview}
      onTriggerRequirements={handleTriggerRequirements}
      onTriggerMRDescription={handleTriggerMRDescription}
      prUrl={analysisUrl}
      prToken={analysisToken}
      onNotesChange={handleNotesChange}
      onTokenChange={handleTokenChange}
      onLoadHistory={handleLoadHistory}
      onAIConfigChange={handleAIConfigChange}
      onReviewChatChange={handleReviewChatChange}
      onSelectedIssueChange={handleSelectedIssueChange}
      onSelectedFileChange={handleSelectedFileChange}
      loadedFromHistory={loadedFromHistory}
      loadedHistoryTimestamp={loadedHistoryTimestamp}
      onDeleteCurrentReview={handleDeleteCurrentReview}
      canDeleteCurrentReview={!!currentHistoryEntryId}
      onDeleteCurrentMrHistory={handleDeleteCurrentMrHistory}
      canDeleteCurrentMrHistory={!!analysisUrl}
    />
  );
}

export default App;
