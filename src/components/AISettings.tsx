import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Check, Save, Trash2, Bookmark } from "lucide-react";
import toast from "react-hot-toast";
import type { AnalysisState } from "../types";

export type PostingMode = "inline" | "general";
export type AnalysisStartMode = "summary-only" | "summary-and-flow";
export type ReviewMode = "quick" | "deep" | "max";

export interface AIPreset {
  id: string;
  name: string;
  model: string;
  auxiliaryModel?: string;
  customRules: string;
  postingMode?: PostingMode;
  analysisStartMode?: AnalysisStartMode;
  reviewMode?: ReviewMode;
}

export interface AIConfig {
  provider: "openrouter";
  apiKey: string;
  model: string;
  auxiliaryModel?: string;
  customRules?: string;
  repoMemory?: string;
  postingMode?: PostingMode;
  analysisStartMode?: AnalysisStartMode;
  reviewMode?: ReviewMode;
  presets?: AIPreset[];
  lastPresetId?: string;
}

export const DEFAULT_PRIMARY_MODEL = "anthropic/claude-sonnet-4-6";
export const DEFAULT_POSTING_MODE: PostingMode = "inline";
export const DEFAULT_ANALYSIS_START_MODE: AnalysisStartMode = "summary-and-flow";
export const DEFAULT_REVIEW_MODE: ReviewMode = "deep";

export const OPENROUTER_MODELS = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", group: "Anthropic", recommended: true },
  { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6", group: "Anthropic" },
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", group: "Anthropic" },
  { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5", group: "Anthropic" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", group: "Anthropic" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", group: "OpenAI", recommended: true },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", group: "OpenAI" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", group: "OpenAI" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", group: "OpenAI" },
  { id: "openai/gpt-4o", label: "GPT-4o", group: "OpenAI" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", group: "OpenAI" },
  { id: "openai/o3", label: "o3", group: "OpenAI" },
  { id: "openai/o4-mini", label: "o4-mini", group: "OpenAI" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "Google", recommended: true },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "Google" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", group: "Google" },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", group: "DeepSeek" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", group: "DeepSeek" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", group: "Meta" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", group: "Meta" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", group: "Meta" },
  { id: "mistralai/mistral-large-2411", label: "Mistral Large", group: "Mistral" },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B", group: "Qwen" },
  { id: "x-ai/grok-3", label: "Grok 3", group: "xAI" },
];

const LEGACY_MODEL_MIGRATIONS: Record<string, string> = {
  "openai/gpt-5.3": "openai/gpt-5.4",
  "openai/gpt-5.3-mini": "openai/gpt-5.4-mini",
};

const OPENROUTER_MODEL_IDS = new Set(OPENROUTER_MODELS.map((model) => model.id));

function canonicalizeModelId(model?: string | null): string {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) return "";
  return LEGACY_MODEL_MIGRATIONS[trimmed] ?? trimmed;
}

export function isSupportedOpenRouterModel(model?: string | null): boolean {
  const canonical = canonicalizeModelId(model);
  return !!canonical && OPENROUTER_MODEL_IDS.has(canonical);
}

export function normalizeOpenRouterModel(model?: string | null, fallback = DEFAULT_PRIMARY_MODEL): string {
  const canonical = canonicalizeModelId(model);
  if (canonical && OPENROUTER_MODEL_IDS.has(canonical)) {
    return canonical;
  }
  return fallback;
}

export function normalizeOptionalOpenRouterModel(model?: string | null): string {
  const canonical = canonicalizeModelId(model);
  if (!canonical) return "";
  return OPENROUTER_MODEL_IDS.has(canonical) ? canonical : "";
}

function sanitizePreset(preset: AIPreset): AIPreset {
  return {
    ...preset,
    model: normalizeOpenRouterModel(preset.model),
    auxiliaryModel: normalizeOptionalOpenRouterModel(preset.auxiliaryModel),
    postingMode: preset.postingMode ?? DEFAULT_POSTING_MODE,
    analysisStartMode: preset.analysisStartMode ?? DEFAULT_ANALYSIS_START_MODE,
    reviewMode: preset.reviewMode ?? DEFAULT_REVIEW_MODE,
  };
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "openrouter",
  apiKey: "",
  model: DEFAULT_PRIMARY_MODEL,
  auxiliaryModel: "",
  customRules: "",
  repoMemory: "",
  postingMode: DEFAULT_POSTING_MODE,
  analysisStartMode: DEFAULT_ANALYSIS_START_MODE,
  reviewMode: DEFAULT_REVIEW_MODE,
  presets: [],
  lastPresetId: "",
};

// Persist to localStorage
const STORAGE_KEY = "mergeai_ai_config";
const REPO_DEFAULTS_KEY = "mergeai_repo_defaults";

interface RepoDefaults {
  model?: string;
  auxiliaryModel?: string;
  customRules?: string;
  repoMemory?: string;
  postingMode?: PostingMode;
  analysisStartMode?: AnalysisStartMode;
  reviewMode?: ReviewMode;
  lastPresetId?: string;
  defaultTab?: AnalysisState["activeTab"];
}

function sanitizeRepoDefaults(defaults: RepoDefaults): RepoDefaults {
  return {
    ...defaults,
    model: defaults.model ? normalizeOpenRouterModel(defaults.model) : undefined,
    auxiliaryModel: defaults.auxiliaryModel ? normalizeOptionalOpenRouterModel(defaults.auxiliaryModel) : undefined,
  };
}

export function sanitizeAIConfig(config: AIConfig): AIConfig {
  const presets = (config.presets ?? []).map(sanitizePreset);
  const lastPresetExists = presets.some((preset) => preset.id === config.lastPresetId);

  return {
    ...DEFAULT_CONFIG,
    ...config,
    model: normalizeOpenRouterModel(config.model),
    auxiliaryModel: normalizeOptionalOpenRouterModel(config.auxiliaryModel),
    postingMode: config.postingMode ?? DEFAULT_POSTING_MODE,
    analysisStartMode: config.analysisStartMode ?? DEFAULT_ANALYSIS_START_MODE,
    reviewMode: config.reviewMode ?? DEFAULT_REVIEW_MODE,
    presets,
    lastPresetId: lastPresetExists ? config.lastPresetId : "",
  };
}

export function loadAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return sanitizeAIConfig({ ...DEFAULT_CONFIG, ...JSON.parse(stored) });
  } catch {}
  return sanitizeAIConfig({ ...DEFAULT_CONFIG });
}

export function saveAIConfig(config: AIConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAIConfig(config)));
  } catch {}
}

export function loadRepoDefaults(repoKey?: string | null): RepoDefaults | null {
  if (!repoKey) return null;
  try {
    const stored = localStorage.getItem(REPO_DEFAULTS_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Record<string, RepoDefaults>;
    return parsed[repoKey] ? sanitizeRepoDefaults(parsed[repoKey]) : null;
  } catch {
    return null;
  }
}

export function saveRepoDefaults(repoKey: string, defaults: Partial<RepoDefaults>) {
  try {
    const stored = localStorage.getItem(REPO_DEFAULTS_KEY);
    const parsed = stored ? JSON.parse(stored) as Record<string, RepoDefaults> : {};
    parsed[repoKey] = sanitizeRepoDefaults({ ...(parsed[repoKey] ?? {}), ...defaults });
    localStorage.setItem(REPO_DEFAULTS_KEY, JSON.stringify(parsed));
  } catch {}
}

export function resolveAIConfigForRepo(baseConfig: AIConfig, repoKey?: string | null): AIConfig {
  const sanitizedBaseConfig = sanitizeAIConfig(baseConfig);
  const defaults = loadRepoDefaults(repoKey);
  if (!defaults) return sanitizeAIConfig({ ...DEFAULT_CONFIG, ...sanitizedBaseConfig });

  const preset = sanitizedBaseConfig.presets?.find((item) => item.id === defaults.lastPresetId);
  if (preset) {
    return sanitizeAIConfig({
      ...DEFAULT_CONFIG,
      ...sanitizedBaseConfig,
      model: preset.model,
      auxiliaryModel: preset.auxiliaryModel ?? sanitizedBaseConfig.auxiliaryModel ?? "",
      customRules: preset.customRules,
      repoMemory: defaults.repoMemory ?? sanitizedBaseConfig.repoMemory,
      postingMode: preset.postingMode ?? defaults.postingMode ?? sanitizedBaseConfig.postingMode ?? DEFAULT_POSTING_MODE,
      analysisStartMode: preset.analysisStartMode ?? defaults.analysisStartMode ?? sanitizedBaseConfig.analysisStartMode ?? DEFAULT_ANALYSIS_START_MODE,
      reviewMode: preset.reviewMode ?? defaults.reviewMode ?? sanitizedBaseConfig.reviewMode ?? DEFAULT_REVIEW_MODE,
      lastPresetId: preset.id,
    });
  }

  return sanitizeAIConfig({
    ...DEFAULT_CONFIG,
    ...sanitizedBaseConfig,
    model: defaults.model ?? sanitizedBaseConfig.model,
    auxiliaryModel: defaults.auxiliaryModel ?? sanitizedBaseConfig.auxiliaryModel ?? "",
    customRules: defaults.customRules ?? sanitizedBaseConfig.customRules,
    repoMemory: defaults.repoMemory ?? sanitizedBaseConfig.repoMemory,
    postingMode: defaults.postingMode ?? sanitizedBaseConfig.postingMode ?? DEFAULT_POSTING_MODE,
    analysisStartMode: defaults.analysisStartMode ?? sanitizedBaseConfig.analysisStartMode ?? DEFAULT_ANALYSIS_START_MODE,
    reviewMode: defaults.reviewMode ?? sanitizedBaseConfig.reviewMode ?? DEFAULT_REVIEW_MODE,
    lastPresetId: defaults.lastPresetId ?? sanitizedBaseConfig.lastPresetId,
  });
}

interface AISettingsProps {
  config: AIConfig;
  onChange: (config: AIConfig) => void;
  disabled?: boolean;
  repoKey?: string | null;
}

// Group models
const MODEL_GROUPS = OPENROUTER_MODELS.reduce<Record<string, typeof OPENROUTER_MODELS>>((acc, m) => {
  if (!acc[m.group]) acc[m.group] = [];
  acc[m.group].push(m);
  return acc;
}, {});

export function AISettings({ config, onChange, disabled, repoKey }: AISettingsProps) {
  const [isOpen, setIsOpen] = useState(!config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [presetName, setPresetName] = useState("");

  const isOpenRouter = true;
  const selectedModel = OPENROUTER_MODELS.find((m) => m.id === config.model);
  const selectedAuxiliaryModel = config.auxiliaryModel
    ? OPENROUTER_MODELS.find((m) => m.id === config.auxiliaryModel)
    : null;
  const selectedPreset = config.presets?.find((preset) => preset.id === config.lastPresetId);

  const handleSave = () => {
    saveAIConfig(config);
    if (repoKey) {
      saveRepoDefaults(repoKey, {
        model: config.model,
        auxiliaryModel: config.auxiliaryModel ?? "",
        customRules: config.customRules ?? "",
        repoMemory: config.repoMemory ?? "",
        postingMode: config.postingMode ?? "inline",
        analysisStartMode: config.analysisStartMode ?? "summary-and-flow",
        reviewMode: config.reviewMode ?? "deep",
        lastPresetId: config.lastPresetId,
      });
    }
    toast.success("AI settings saved to browser");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Enter a preset name first");
      return;
    }

    const preset: AIPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name,
      model: config.model,
      auxiliaryModel: config.auxiliaryModel ?? "",
      customRules: config.customRules ?? "",
      postingMode: config.postingMode ?? "inline",
      analysisStartMode: config.analysisStartMode ?? "summary-and-flow",
      reviewMode: config.reviewMode ?? "deep",
    };

    onChange({
      ...config,
      presets: [...(config.presets ?? []), preset],
      lastPresetId: preset.id,
    });
    setPresetName("");
    toast.success(`Saved preset "${name}"`);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = config.presets?.find((item) => item.id === presetId);
    if (!preset) return;
    onChange({
      ...config,
      model: preset.model,
      auxiliaryModel: preset.auxiliaryModel ?? "",
      customRules: preset.customRules,
      postingMode: preset.postingMode ?? "inline",
      analysisStartMode: preset.analysisStartMode ?? "summary-and-flow",
      reviewMode: preset.reviewMode ?? "deep",
      lastPresetId: preset.id,
    });
    toast.success(`Applied preset "${preset.name}"`);
  };

  const handleDeletePreset = (presetId: string) => {
    const preset = config.presets?.find((item) => item.id === presetId);
    onChange({
      ...config,
      presets: (config.presets ?? []).filter((item) => item.id !== presetId),
      lastPresetId: config.lastPresetId === presetId ? "" : config.lastPresetId,
    });
    toast.success(`Deleted preset "${preset?.name ?? "Preset"}"`);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-secondary/50 transition-colors text-left bg-card"
      >
        <Cpu size={14} className={isOpenRouter && config.apiKey ? "text-accent" : "text-muted-foreground"} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">AI Model Settings</span>
          <span className="text-xs text-muted-foreground ml-2">
            {config.apiKey
              ? `OpenRouter · ${selectedModel?.label ?? config.model}`
              + (selectedAuxiliaryModel ? ` · Fast tasks: ${selectedAuxiliaryModel.label}` : "")
              : "OpenRouter · No API key set"}
          </span>
        </div>
        {config.apiKey && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
            Custom
          </span>
        )}
        {isOpen ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 border-t border-border bg-secondary/30 space-y-4">
              {/* Provider info */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Provider</p>
                <p className="text-sm text-foreground">OpenRouter — Bring Your Own Key</p>
              </div>

              {isOpenRouter && (
                <>
                  {/* API Key */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">OpenRouter API Key</p>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Get key <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={config.apiKey}
                        onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                        placeholder="sk-or-v1-xxxxxxxxxxxx"
                        disabled={disabled}
                        className="w-full pr-10 pl-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/50 text-foreground font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      The key is used directly from your browser for OpenRouter requests and is only stored locally if you save settings.
                    </p>
                  </div>

                  {/* Model selector */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Primary Review Model</p>
                    <select
                      value={config.model}
                      onChange={(e) => onChange({ ...config, model: e.target.value })}
                      disabled={disabled}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all text-foreground appearance-none cursor-pointer"
                    >
                      {Object.entries(MODEL_GROUPS).map(([group, models]) => (
                        <optgroup key={group} label={group}>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}{m.recommended ? " ★" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for the main code review. Models marked ★ are strong default choices.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Auxiliary Model</p>
                    <select
                      value={config.auxiliaryModel ?? ""}
                      onChange={(e) => onChange({ ...config, auxiliaryModel: e.target.value })}
                      disabled={disabled}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all text-foreground appearance-none cursor-pointer"
                    >
                      <option value="">Use primary review model</option>
                      {Object.entries(MODEL_GROUPS).map(([group, models]) => (
                        <optgroup key={group} label={group}>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}{m.recommended ? " ★" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for summary, execution flow, requirements, MR description, chat, and fix suggestions to reduce cost and latency.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Posting Preference</p>
                    <select
                      value={config.postingMode ?? "inline"}
                      onChange={(e) => onChange({ ...config, postingMode: e.target.value as PostingMode })}
                      disabled={disabled}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all text-foreground appearance-none cursor-pointer"
                    >
                      <option value="inline">Prefer inline comments</option>
                      <option value="general">Prefer general comments</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Inline tries line-level comments first. General posts MR/PR-level notes directly.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Start Mode</p>
                      <select
                        value={config.analysisStartMode ?? "summary-and-flow"}
                        onChange={(e) => onChange({ ...config, analysisStartMode: e.target.value as AnalysisStartMode })}
                        disabled={disabled}
                        className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all text-foreground appearance-none cursor-pointer"
                      >
                        <option value="summary-and-flow">Summary + flow</option>
                        <option value="summary-only">Summary only</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Summary only is the fastest and cheapest start; execution flow can still be generated later.
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Review Depth</p>
                      <select
                        value={config.reviewMode ?? "deep"}
                        onChange={(e) => onChange({ ...config, reviewMode: e.target.value as ReviewMode })}
                        disabled={disabled}
                        className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all text-foreground appearance-none cursor-pointer"
                      >
                        <option value="deep">Deep review</option>
                        <option value="quick">Quick review</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Quick review limits context and focuses on higher-severity findings for lower latency.
                      </p>
                    </div>
                  </div>

                  {/* Custom review rules */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Custom Review Rules (optional)</p>
                    <textarea
                      value={config.customRules ?? ""}
                      onChange={(e) => onChange({ ...config, customRules: e.target.value })}
                      placeholder="e.g. Always flag console.log statements as warnings. Pay extra attention to SQL injection. Our team uses camelCase for variables and PascalCase for components."
                      disabled={disabled}
                      rows={3}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/50 text-foreground resize-y"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Add team-specific rules or focus areas. These are injected into the review prompt.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presets</p>
                      {selectedPreset && (
                        <span className="text-[11px] text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">
                          Active: {selectedPreset.name}
                        </span>
                      )}
                    </div>

                    {config.presets && config.presets.length > 0 && (
                      <div className="space-y-2">
                        {config.presets.map((preset) => (
                          <div key={preset.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(preset.id)}
                              className="flex-1 text-left"
                            >
                              <p className="text-sm text-foreground font-medium">{preset.name}</p>
                                 <p className="text-xs text-muted-foreground">
                                {OPENROUTER_MODELS.find((model) => model.id === preset.model)?.label ?? preset.model}
                                {preset.auxiliaryModel ? ` · Fast: ${OPENROUTER_MODELS.find((model) => model.id === preset.auxiliaryModel)?.label ?? preset.auxiliaryModel}` : ""}
                                {` · ${(preset.reviewMode ?? "deep") === "deep" ? "Deep" : "Quick"}`}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(preset.id)}
                              className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePreset(preset.id)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete preset"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Bookmark size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="Save current setup as preset"
                          disabled={disabled}
                          className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/50 text-foreground"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSavePreset}
                        disabled={disabled || !presetName.trim()}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary transition-all disabled:opacity-50 text-foreground"
                      >
                        <Save size={12} />
                        Save
                      </button>
                    </div>

                    {repoKey && (
                      <p className="text-xs text-muted-foreground">
                        Saving settings also stores the active preset and posting mode as defaults for this repository.
                      </p>
                    )}
                  </div>

                  {/* Save button */}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={disabled || !config.apiKey}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-all disabled:opacity-50 text-foreground"
                  >
                    {saved ? <Check size={12} className="text-accent" /> : <Cpu size={12} />}
                    {saved ? "Saved to browser" : "Save settings"}
                  </button>
                </>
              )}

              {!config.apiKey && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provide your OpenRouter API key to start analyzing. Get one at openrouter.ai/keys.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
