import { motion } from "framer-motion";
import { GitPullRequest, FileText, GitBranch, Search, CheckCircle, Cpu } from "lucide-react";
import type { AnalysisStep } from "../types";
import type { AIConfig } from "./AISettings";
import { OPENROUTER_MODELS } from "./AISettings";
import { ThemeToggle } from "./ThemeToggle";

interface AnalysisProgressProps {
  step: AnalysisStep;
  prTitle?: string;
  error?: string | null;
  onReset: () => void;
  aiConfig?: AIConfig | null;
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
}

const STEPS = [
  { id: "fetching", label: "Fetching diff", icon: GitBranch, description: "Retrieving file changes from the repository" },
  { id: "summarizing", label: "Summarizing changes", icon: FileText, description: "AI is analyzing what changed and why" },
  { id: "flowing", label: "Mapping execution flow", icon: GitPullRequest, description: "Ordering changes by architectural layer" },
];

function getStepIndex(step: AnalysisStep): number {
  const order: AnalysisStep[] = ["fetching", "summarizing", "flowing", "reviewing", "done"];
  return order.indexOf(step);
}

export function AnalysisProgress({ step, prTitle, error, onReset, aiConfig, theme, onThemeChange }: AnalysisProgressProps) {
  const modelLabel = aiConfig?.provider === "openrouter" && aiConfig.apiKey
    ? OPENROUTER_MODELS.find((m) => m.id === aiConfig.model)?.label ?? aiConfig.model
    : "No model configured";
  const currentIdx = getStepIndex(step);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg"
        >
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-2xl">⚠</span>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Analysis Failed</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{error}</p>
          <button
            onClick={onReset}
            className="px-6 py-2.5 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition-all active:scale-95"
          >
            Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
            <GitPullRequest size={16} className="text-background" />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-lg">MergeAI Reviewer</span>
          <div className="ml-auto">
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {prTitle && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Analyzing</p>
              <h2 className="text-xl font-bold text-foreground line-clamp-2">{prTitle}</h2>
            </motion.div>
          )}

          {!prTitle && (
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-foreground">Analyzing your PR...</h2>
              <p className="text-sm text-muted-foreground mt-1">This usually takes 15–45 seconds</p>
            </div>
          )}

          <div className="space-y-3">
            {STEPS.map((s, idx) => {
              const isDone = currentIdx > idx || step === "done";
              const isActive = STEPS[currentIdx]?.id === s.id;
              const isPending = idx > currentIdx && step !== "done";
              const Icon = s.icon;

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.3 }}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    isActive
                      ? "border-foreground/20 bg-foreground/5 shadow-sm"
                      : isDone
                      ? "border-border bg-card"
                      : "border-border/50 bg-card/50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isDone
                        ? "bg-accent/10 text-accent"
                        : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle size={17} />
                    ) : isActive ? (
                      <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    ) : (
                      <Icon size={16} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        isPending ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {s.label}
                    </p>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-muted-foreground mt-0.5"
                      >
                        {s.description}
                      </motion.p>
                    )}
                  </div>

                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-1"
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-foreground"
                        />
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center gap-2 mt-8"
          >
            <Cpu size={12} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Analyzing with <span className="font-medium text-foreground">{modelLabel}</span>
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
