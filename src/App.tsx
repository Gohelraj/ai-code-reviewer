import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { InputForm } from "./components/InputForm";
import type { SubmitPayload } from "./components/InputForm";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { fetchMRDiff, analyzeSummary, analyzeExecutionFlow, analyzeCodeReview } from "./lib/api";
import { saveAnalysis } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import type { AnalysisState } from "./types";
import type { AIConfig } from "./components/AISettings";
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
  const [analysisUrl, setAnalysisUrl] = useState("");
  const [analysisToken, setAnalysisToken] = useState<string | undefined>(undefined);
  const { theme, setTheme } = useDarkMode();

  const updateState = useCallback((patch: Partial<AnalysisState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleAnalyze = useCallback(async ({ url, token, aiConfig }: SubmitPayload) => {
    setState({ ...INITIAL_STATE, step: "fetching" });
    setActiveAIConfig(aiConfig);
    setAnalysisUrl(url);
    setAnalysisToken(token);

    try {
      // Step 1: Fetch diff
      const mrData = await fetchMRDiff(url, token);
      updateState({ step: "summarizing", mrData });

      // Step 2: Summarize + flow in parallel, then review
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
    setAnalysisUrl("");
    setAnalysisToken(undefined);
  }, []);

  const handleLoadHistory = useCallback((entry: HistoryEntry) => {
    setState(entry.state);
    setActiveAIConfig(entry.aiConfig);
    setAnalysisUrl(entry.url);
    setReviewLoading(false);
  }, []);

  const handleTabChange = useCallback((tab: "summary" | "flow" | "review") => {
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
          onTriggerReview={handleTriggerReview}
          prUrl={analysisUrl}
          prToken={analysisToken}
          onNotesChange={handleNotesChange}
          onTokenChange={handleTokenChange}
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
      onTriggerReview={handleTriggerReview}
      prUrl={analysisUrl}
      prToken={analysisToken}
      onNotesChange={handleNotesChange}
      onTokenChange={handleTokenChange}
    />
  );
}

export default App;
