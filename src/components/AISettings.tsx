import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Check } from "lucide-react";

export interface AIConfig {
  provider: "openrouter";
  apiKey: string;
  model: string;
}

export const OPENROUTER_MODELS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", group: "Anthropic", recommended: true },
  { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5", group: "Anthropic" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", group: "Anthropic" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", group: "OpenAI", recommended: true },
  { id: "openai/gpt-4o", label: "GPT-4o", group: "OpenAI" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", group: "OpenAI" },
  { id: "openai/o3", label: "o3", group: "OpenAI" },
  { id: "google/gemini-2.5-pro-preview-03-25", label: "Gemini 2.5 Pro", group: "Google", recommended: true },
  { id: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash", group: "Google" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", group: "Google" },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", group: "DeepSeek" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", group: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", group: "Meta" },
  { id: "mistralai/mistral-large-2411", label: "Mistral Large", group: "Mistral" },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B", group: "Qwen" },
  { id: "x-ai/grok-3-beta", label: "Grok 3 Beta", group: "xAI" },
];

const DEFAULT_CONFIG: AIConfig = {
  provider: "openrouter",
  apiKey: "",
  model: "anthropic/claude-sonnet-4-5",
};

// Persist to localStorage
const STORAGE_KEY = "mergeai_ai_config";

export function loadAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveAIConfig(config: AIConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

interface AISettingsProps {
  config: AIConfig;
  onChange: (config: AIConfig) => void;
  disabled?: boolean;
}

// Group models
const MODEL_GROUPS = OPENROUTER_MODELS.reduce<Record<string, typeof OPENROUTER_MODELS>>((acc, m) => {
  if (!acc[m.group]) acc[m.group] = [];
  acc[m.group].push(m);
  return acc;
}, {});

export function AISettings({ config, onChange, disabled }: AISettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const isOpenRouter = true;
  const selectedModel = OPENROUTER_MODELS.find((m) => m.id === config.model);

  const handleSave = () => {
    saveAIConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
                      Key is sent to the analysis server and never logged or stored permanently.
                    </p>
                  </div>

                  {/* Model selector */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Model</p>
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
                      Models marked ★ are recommended for code review quality.
                    </p>
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
