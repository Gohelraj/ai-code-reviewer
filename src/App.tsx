import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { InputForm } from "./components/InputForm";
import type { SubmitPayload } from "./components/InputForm";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { fetchMRDiff, analyzeSummary, analyzeExecutionFlow, analyzeCodeReview, fetchIssueData, analyzeRequirements, analyzeMRDescription } from "./lib/api";
import type { IssueData } from "./lib/api";
import { saveAnalysis } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import type { AnalysisState } from "./types";
import type { AIConfig } from "./components/AISettings";
import { saveAIConfig } from "./components/AISettings";
import { useDarkMode } from "./lib/useDarkMode";

const INITIAL_STATE: AnalysisState = {
  step: "idle",
  mrData: null,
  summary: null,
  executionFlow: null,
  codeReview: null,
  error: null,
  activeTab: "summary",
};

function App() {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const [activeAIConfig, setActiveAIConfig] = useState<AIConfig | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);
  const [mrDescLoading, setMrDescLoading] = useState(false);
  const [analysisUrl, setAnalysisUrl] = useState("");
  const [analysisToken, setAnalysisToken] = useState<string | undefined>(undefined);
  const [issueData, setIssueData] = useState<IssueData | null>(null);
  const { theme, setTheme } = useDarkMode();

  const updateState = useCallback((patch: Partial<AnalysisState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleAnalyze = useCallback(async ({ url, token, aiConfig, issueUrl }: SubmitPayload) => {
    setState({ ...INITIAL_STATE, step: "fetching" });
    setActiveAIConfig(aiConfig);
    setAnalysisUrl(url);
    setAnalysisToken(token);
    setIssueData(null);

    try {
      // Step 1: Fetch diff + optional issue data
      const mrDataPromise = fetchMRDiff(url, token);
      const issuePromise = issueUrl
        ? fetchIssueData(issueUrl, token).catch((err) => {
            toast.error(`Issue fetch failed: ${err instanceof Error ? err.message : "Unknown"}`);
            return null;
          })
        : Promise.resolve(null);

      const [mrData, issue] = await Promise.all([mrDataPromise, issuePromise]);
      if (issue) setIssueData(issue);
      updateState({ step: "summarizing", mrData, linkedIssueUrl: issueUrl });

      // Step 2: Summarize + flow in parallel (requirements & MR desc are manual)
      updateState({ step: "summarizing" });
      const summaryPromise = analyzeSummary(mrData, aiConfig).then((summary) => {
        updateState({ summary, activeTab: "summary" });
        return summary;
      });

      updateState({ step: "flowing" });
      const flowPromise = analyzeExecutionFlow(mrData, aiConfig).then((executionFlow) => {
        updateState({ executionFlow });
        return executionFlow;
      });

      await Promise.all([summaryPromise, flowPromise]);

      // Done — code review is triggered manually by the user
      updateState({ step: "done" });
      toast.success("Analysis complete!");

      // Save to history
      // We need to get the latest state, so use a callback
      setState((prev) => {
        saveAnalysis(url, prev, aiConfig);
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unexpected error occurred";
      updateState({ step: "error", error });
      toast.error(error);
    }
  }, [updateState]);

  const handleReset = useCallback(() => {
    setState(INITIAL_STATE);
    setActiveAIConfig(null);
    setReviewLoading(false);
    setReqLoading(false);
    setMrDescLoading(false);
    setAnalysisUrl("");
    setAnalysisToken(undefined);
    setIssueData(null);
  }, []);

  const handleLoadHistory = useCallback((entry: HistoryEntry) => {
    setState(entry.state);
    setActiveAIConfig(entry.aiConfig);
    setAnalysisUrl(entry.url);
    setReviewLoading(false);
  }, []);

  const handleTabChange = useCallback((tab: "summary" | "flow" | "review" | "requirements" | "mr-description") => {
    updateState({ activeTab: tab });
  }, [updateState]);

  const handleNotesChange = useCallback((notes: string) => {
    updateState({ reviewerNotes: notes });
    // Re-save to history
    setState((prev) => {
      const updated = { ...prev, reviewerNotes: notes };
      if (analysisUrl && activeAIConfig) {
        saveAnalysis(analysisUrl, updated, activeAIConfig);
      }
      return updated;
    });
  }, [updateState, analysisUrl, activeAIConfig]);

  const handleTokenChange = useCallback((token: string) => {
    setAnalysisToken(token);
  }, []);

  const handleAIConfigChange = useCallback((config: AIConfig) => {
    setActiveAIConfig(config);
    saveAIConfig(config);
  }, []);

  const handleTriggerReview = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || reviewLoading) return;
    setReviewLoading(true);

    // Stash current review as "previous" for comparison
    if (state.codeReview) {
      updateState({ previousReview: state.codeReview });
    }

    try {
      const codeReview = await analyzeCodeReview(state.mrData, activeAIConfig);
      updateState({ codeReview, activeTab: "review" });
      toast.success("Code review complete!");

      // Update history with review
      setState((prev) => {
        if (analysisUrl && activeAIConfig) {
          saveAnalysis(analysisUrl, prev, activeAIConfig);
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
  }, [state.mrData, activeAIConfig, reviewLoading, updateState]);

  const handleTriggerRequirements = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || !issueData || reqLoading) return;
    setReqLoading(true);
    try {
      const requirementsCheck = await analyzeRequirements(state.mrData, issueData, activeAIConfig);
      updateState({ requirementsCheck });
      toast.success("Requirements check complete!");
      setState((prev) => {
        if (analysisUrl && activeAIConfig) saveAnalysis(analysisUrl, prev, activeAIConfig);
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Requirements check failed";
      toast.error(error);
    } finally {
      setReqLoading(false);
    }
  }, [state.mrData, activeAIConfig, issueData, reqLoading, updateState, analysisUrl]);

  const handleTriggerMRDescription = useCallback(async () => {
    if (!state.mrData || !activeAIConfig || mrDescLoading) return;
    setMrDescLoading(true);
    try {
      const mrDescriptionReview = await analyzeMRDescription(state.mrData, activeAIConfig, issueData);
      updateState({ mrDescriptionReview });
      toast.success("MR description review complete!");
      setState((prev) => {
        if (analysisUrl && activeAIConfig) saveAnalysis(analysisUrl, prev, activeAIConfig);
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "MR description review failed";
      toast.error(error);
    } finally {
      setMrDescLoading(false);
    }
  }, [state.mrData, activeAIConfig, issueData, mrDescLoading, updateState, analysisUrl]);

  // Show input form
  if (state.step === "idle") {
    return <InputForm onSubmit={handleAnalyze} isLoading={false} theme={theme} onThemeChange={setTheme} onLoadHistory={handleLoadHistory} />;
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
          reqLoading={reqLoading}
          mrDescLoading={mrDescLoading}
          onTriggerReview={handleTriggerReview}
          onTriggerRequirements={handleTriggerRequirements}
          onTriggerMRDescription={handleTriggerMRDescription}
          prUrl={analysisUrl}
          prToken={analysisToken}
          onNotesChange={handleNotesChange}
          onTokenChange={handleTokenChange}
          onLoadHistory={handleLoadHistory}
          onAIConfigChange={handleAIConfigChange}
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
      reqLoading={reqLoading}
      mrDescLoading={mrDescLoading}
      onTriggerReview={handleTriggerReview}
      onTriggerRequirements={handleTriggerRequirements}
      onTriggerMRDescription={handleTriggerMRDescription}
      prUrl={analysisUrl}
      prToken={analysisToken}
      onNotesChange={handleNotesChange}
      onTokenChange={handleTokenChange}
      onLoadHistory={handleLoadHistory}
      onAIConfigChange={handleAIConfigChange}
    />
  );
}

export default App;
