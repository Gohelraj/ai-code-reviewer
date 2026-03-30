import { useState, useCallback } from "react";
import { InputForm } from "./components/InputForm";
import type { SubmitPayload } from "./components/InputForm";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { fetchMRDiff, analyzeSummary, analyzeExecutionFlow, analyzeCodeReview } from "./lib/api";
import type { AnalysisState } from "./types";
import type { AIConfig } from "./components/AISettings";

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

  const updateState = useCallback((patch: Partial<AnalysisState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleAnalyze = useCallback(async ({ url, token, aiConfig }: SubmitPayload) => {
    setState({ ...INITIAL_STATE, step: "fetching" });
    setActiveAIConfig(aiConfig);

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

      // Step 4: Code review
      updateState({ step: "reviewing" });
      const codeReview = await analyzeCodeReview(mrData, aiConfig);
      updateState({ codeReview, step: "done" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "An unexpected error occurred";
      updateState({ step: "error", error });
    }
  }, [updateState]);

  const handleReset = useCallback(() => {
    setState(INITIAL_STATE);
    setActiveAIConfig(null);
  }, []);

  const handleTabChange = useCallback((tab: "summary" | "flow" | "review") => {
    updateState({ activeTab: tab });
  }, [updateState]);

  // Show input form
  if (state.step === "idle") {
    return <InputForm onSubmit={handleAnalyze} isLoading={false} />;
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
    />
  );
}

export default App;
