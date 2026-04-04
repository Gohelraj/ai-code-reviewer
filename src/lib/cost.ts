import type { AIConfig } from "../components/AISettings";
import { normalizeOpenRouterModel, normalizeOptionalOpenRouterModel } from "../components/AISettings";
import type { FileDiff } from "../types";
import { estimateReviewContextChars } from "./review-utils";

// Approximate pricing per 1M tokens (input/output) from OpenRouter.
// These are rough estimates and may change.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
  "anthropic/claude-opus-4-6": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4-5": { input: 3, output: 15 },
  "anthropic/claude-opus-4-5": { input: 15, output: 75 },
  "anthropic/claude-3.5-sonnet": { input: 3, output: 15 },
  "openai/gpt-5.4": { input: 2.5, output: 15 },
  "openai/gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  "openai/gpt-4.1": { input: 2, output: 8 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/o3": { input: 10, output: 40 },
  "openai/o4-mini": { input: 1.1, output: 4.4 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "deepseek/deepseek-chat-v3-0324": { input: 0.27, output: 1.1 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
  "meta-llama/llama-4-maverick": { input: 0.5, output: 0.7 },
  "meta-llama/llama-4-scout": { input: 0.2, output: 0.3 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.3, output: 0.3 },
  "mistralai/mistral-large-2411": { input: 2, output: 6 },
  "qwen/qwen3-235b-a22b": { input: 0.8, output: 0.8 },
  "x-ai/grok-3": { input: 3, output: 15 },
};

const DEFAULT_PRICING = { input: 2, output: 10 };

/** Rough estimate: ~4 chars per token for code */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  perCallCost: number;
  calls: number;
}

export interface AnalysisCostBreakdown {
  startCost: number;
  reviewCost: number;
  requirementsCost: number;
  mrDescriptionCost: number;
  chatCost: number;
  fixCost: number;
  totalCoreCost: number;
}

function estimateCostForCall(contextText: string, model: string, promptOverhead = 500, outputTokens = 2000): CostEstimate {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputTokensPerCall = estimateTokens(contextText) + promptOverhead;
  const outputTokensPerCall = outputTokens;
  const calls = 1;

  const totalInput = inputTokensPerCall * calls;
  const totalOutput = outputTokensPerCall * calls;

  const inputCost = (totalInput / 1_000_000) * pricing.input;
  const outputCost = (totalOutput / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalCost,
    perCallCost: totalCost / calls,
    calls,
  };
}

export function estimateCost(diffText: string, model: string): CostEstimate {
  return estimateCostForCall(diffText, model);
}

export function estimateAnalysisCost(files: FileDiff[], aiConfig: AIConfig): AnalysisCostBreakdown {
  const diffText = files.map((file) => file.patch ?? "").join("\n");
  const reviewModel = normalizeOpenRouterModel(aiConfig.model);
  const auxiliaryModel = normalizeOptionalOpenRouterModel(aiConfig.auxiliaryModel) || reviewModel;
  const startMode = aiConfig.analysisStartMode ?? "summary-and-flow";
  const reviewMode = aiConfig.reviewMode ?? "deep";
  const reviewContextChars = estimateReviewContextChars(files, reviewMode);
  const reviewPlaceholder = "x".repeat(reviewContextChars);

  const summaryCost = estimateCostForCall(diffText, auxiliaryModel, 450, 900).totalCost;
  const flowCost = estimateCostForCall(diffText, auxiliaryModel, 450, 1200).totalCost;
  const reviewCost = estimateCostForCall(reviewPlaceholder, reviewModel, 900, reviewMode === "quick" ? 1800 : 2600).totalCost;
  const requirementsCost = estimateCostForCall(diffText, auxiliaryModel, 700, 1800).totalCost;
  const mrDescriptionCost = estimateCostForCall(diffText, auxiliaryModel, 600, 1600).totalCost;
  const chatCost = estimateCostForCall(reviewPlaceholder.slice(0, Math.min(reviewPlaceholder.length, 24_000)), auxiliaryModel, 350, 700).totalCost;
  const fixCost = estimateCostForCall(reviewPlaceholder.slice(0, Math.min(reviewPlaceholder.length, 18_000)), auxiliaryModel, 500, 900).totalCost;

  const startCost = summaryCost + (startMode === "summary-and-flow" ? flowCost : 0);

  return {
    startCost,
    reviewCost,
    requirementsCost,
    mrDescriptionCost,
    chatCost,
    fixCost,
    totalCoreCost: startCost + reviewCost,
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return "< $0.001";
  if (cost < 0.01) return `~$${cost.toFixed(3)}`;
  return `~$${cost.toFixed(2)}`;
}
