import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Sparkles, X } from "lucide-react";
import {
  OPENROUTER_MODELS,
  DEFAULT_ANALYSIS_START_MODE,
  DEFAULT_REVIEW_MODE,
  type AIConfig,
  type AnalysisStartMode,
  type ReviewMode,
} from "./AISettings";

interface SetupWizardProps {
  open: boolean;
  config: AIConfig;
  token: string;
  rememberToken: boolean;
  platformLabel: string;
  onClose: () => void;
  onComplete: (payload: {
    config: AIConfig;
    token: string;
    rememberToken: boolean;
  }) => void;
}

type WizardStep = 0 | 1 | 2;

const RECOMMENDED_MODELS = OPENROUTER_MODELS.filter((model) => model.recommended);

export function SetupWizard({
  open,
  config,
  token,
  rememberToken,
  platformLabel,
  onClose,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const [draftConfig, setDraftConfig] = useState<AIConfig>(config);
  const [draftToken, setDraftToken] = useState(token);
  const [draftRememberToken, setDraftRememberToken] = useState(rememberToken);

  useEffect(() => {
    if (!open) return;
    setStep(config.apiKey.trim() ? 1 : 0);
    setDraftConfig(config);
    setDraftToken(token);
    setDraftRememberToken(rememberToken);
  }, [open, config, token, rememberToken]);

  const stepMeta = useMemo(() => ([
    { title: "Connect AI reviewer", description: "Add your OpenRouter key so analysis can run." },
    { title: "Choose review defaults", description: "Pick the speed and depth you want by default." },
    { title: "Private access if needed", description: "Only add a repo token if this review needs private access or posting." },
  ]), []);

  const currentStep = stepMeta[step];
  const canAdvance = (
    step === 0 ? !!draftConfig.apiKey.trim() : true
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_30px_80px_-36px_rgba(0,0,0,0.65)]"
        >
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Setup Once</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Let’s get your reviewer ready</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  We’ll only ask for the pieces that matter up front. Everything else can stay out of the way.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {stepMeta.map((item, index) => {
                const isActive = index === step;
                const isDone = index < step;
                return (
                  <div
                    key={item.title}
                    className={`rounded-xl border px-3 py-2 text-left ${
                      isActive
                        ? "border-accent/30 bg-accent/10"
                        : isDone
                          ? "border-border bg-secondary/50"
                          : "border-border/80 bg-background"
                    }`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isActive ? "text-accent" : "text-muted-foreground"}`}>
                      0{index + 1}
                    </p>
                    <p className="mt-1 text-xs font-medium text-foreground">
                      {isDone ? "Done" : item.title}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="mb-5">
              <p className="text-lg font-semibold tracking-tight text-foreground">{currentStep.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{currentStep.description}</p>
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">OpenRouter API key</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        This stays in your browser and is the only required setup for first use.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">API key</label>
                  <input
                    type="password"
                    value={draftConfig.apiKey}
                    onChange={(e) => setDraftConfig((current) => ({ ...current, apiKey: e.target.value }))}
                    placeholder="sk-or-v1-xxxxxxxxxxxx"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    You can change models, presets, and posting behavior later in advanced settings.
                  </p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Primary model</label>
                    <select
                      value={draftConfig.model}
                      onChange={(e) => setDraftConfig((current) => ({ ...current, model: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      {RECOMMENDED_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                      {OPENROUTER_MODELS.filter((model) => !model.recommended).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Review depth</label>
                    <select
                      value={draftConfig.reviewMode ?? DEFAULT_REVIEW_MODE}
                      onChange={(e) => setDraftConfig((current) => ({ ...current, reviewMode: e.target.value as ReviewMode }))}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      <option value="deep">Deep review</option>
                      <option value="quick">Quick review</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">First-pass mode</label>
                  <select
                    value={draftConfig.analysisStartMode ?? DEFAULT_ANALYSIS_START_MODE}
                    onChange={(e) => setDraftConfig((current) => ({ ...current, analysisStartMode: e.target.value as AnalysisStartMode }))}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="summary-and-flow">Summary + flow</option>
                    <option value="summary-only">Summary only</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-border bg-secondary/35 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles size={16} className="mt-0.5 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Recommended default</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Start with `summary + flow` and `deep review` if you want the landing experience to feel immediately valuable.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/35 p-4">
                  <p className="text-sm font-semibold text-foreground">Need private {platformLabel} access or comment posting?</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    If not, skip this step. Public reviews work fine without a repo token.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Access token</label>
                  <input
                    type="password"
                    value={draftToken}
                    onChange={(e) => setDraftToken(e.target.value)}
                    placeholder="ghp_xxxx or glpat-xxxx"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  {platformLabel === "GitLab" && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Required PAT scopes</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs font-mono text-foreground">read_api</span>
                        <span className="text-xs text-muted-foreground">read MR diffs, commits, repo files</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs font-mono text-foreground">api</span>
                        <span className="text-xs text-muted-foreground">also needed to post review comments back</span>
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draftRememberToken}
                    onChange={(e) => setDraftRememberToken(e.target.checked)}
                    className="mt-0.5 rounded border-border bg-background"
                  />
                  <span>Remember this token on this device for the current repository.</span>
                </label>

                <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="mt-0.5 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">You’re ready after this</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Review-specific extras like linked issue checks stay near the PR input, while advanced setup remains available later.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Close
                </button>
              )}
            </div>

            {step < 2 ? (
              <button
                type="button"
                disabled={!canAdvance}
                onClick={() => setStep((current) => Math.min(2, current + 1) as WizardStep)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all hover:bg-foreground/92 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onComplete({
                  config: draftConfig,
                  token: draftToken.trim(),
                  rememberToken: draftRememberToken,
                })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,hsl(142_71%_45%)_0%,hsl(160_84%_39%)_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_38px_-24px_hsl(142_71%_45%_/_0.7)] transition-all hover:brightness-105"
              >
                Save and finish
                <CheckCircle2 size={14} />
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
