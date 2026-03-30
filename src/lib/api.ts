import type { MRData, ChangeSummary, ExecutionFlow, CodeReview } from "../types";
import type { AIConfig } from "../components/AISettings";

const FETCH_DIFF_URL = "https://r0u311ck--fetch-mr-diff.functions.blink.new";
const ANALYZE_URL = "https://r0u311ck--analyze-mr.functions.blink.new";

async function callEdgeFunction<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }

  return data as T;
}

export async function fetchMRDiff(url: string, token?: string): Promise<MRData> {
  return callEdgeFunction<MRData>(FETCH_DIFF_URL, {
    url,
    githubToken: token || undefined,
  });
}

function buildAIPayload(aiConfig: AIConfig) {
  if (aiConfig.provider === "openrouter" && aiConfig.apiKey) {
    return { aiProvider: "openrouter", aiApiKey: aiConfig.apiKey, aiModel: aiConfig.model };
  }
  return { aiProvider: "blink" };
}

export async function analyzeSummary(mrData: MRData, aiConfig: AIConfig): Promise<ChangeSummary> {
  const result = await callEdgeFunction<{ success: boolean; data: ChangeSummary }>(ANALYZE_URL, {
    pr: mrData.pr,
    files: mrData.files,
    analysisType: "summary",
    ...buildAIPayload(aiConfig),
  });
  return result.data;
}

export async function analyzeExecutionFlow(mrData: MRData, aiConfig: AIConfig): Promise<ExecutionFlow> {
  const result = await callEdgeFunction<{ success: boolean; data: ExecutionFlow }>(ANALYZE_URL, {
    pr: mrData.pr,
    files: mrData.files,
    analysisType: "executionFlow",
    ...buildAIPayload(aiConfig),
  });
  return result.data;
}

export async function analyzeCodeReview(mrData: MRData, aiConfig: AIConfig): Promise<CodeReview> {
  const result = await callEdgeFunction<{ success: boolean; data: CodeReview }>(ANALYZE_URL, {
    pr: mrData.pr,
    files: mrData.files,
    analysisType: "codeReview",
    ...buildAIPayload(aiConfig),
  });
  return result.data;
}
