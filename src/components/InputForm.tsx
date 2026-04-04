import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { GitPullRequest, Key, ChevronDown, ChevronUp, Sparkles, GitBranch, ArrowRight, Shield, FileText, Search, Layers, Clock, Trash2, ListChecks, Cpu, CheckCircle2, BookOpenText, type LucideIcon } from "lucide-react";
import { AISettings, loadAIConfig, resolveAIConfigForRepo, saveAIConfig, saveRepoDefaults } from "./AISettings";
import type { AIConfig } from "./AISettings";
import { RepoContextSettings } from "./RepoContextSettings";
import { SetupWizard } from "./SetupWizard";
import { ThemeToggle } from "./ThemeToggle";
import { getHistory, deleteAnalysis } from "../lib/history";
import type { HistoryEntry } from "../lib/history";
import { formatDistanceToNow } from "date-fns";
import { getRepoKeyFromUrl } from "../lib/review-utils";
import { clearStoredRepoToken, loadStoredRepoToken, saveStoredRepoToken } from "../lib/token-storage";

export interface SubmitPayload {
  url: string;
  token?: string;
  aiConfig: AIConfig;
  issueUrl?: string;
  forceRefresh?: boolean;
}

interface InputFormProps {
  onSubmit: (payload: SubmitPayload) => void;
  isLoading: boolean;
  theme: "light" | "dark" | "system";
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  onLoadHistory?: (entry: HistoryEntry) => void;
  onClearHistory?: () => Promise<void> | void;
}

const EXAMPLE_URLS = [
  "https://github.com/facebook/react/pull/28123",
  "https://github.com/vercel/next.js/pull/54321",
  "https://gitlab.com/gitlab-org/gitlab/-/merge_requests/12345",
];

const TRUST_POINTS = [
  { icon: Shield, label: "Browser-first setup", detail: "No backend required to get started." },
  { icon: GitPullRequest, label: "GitHub + GitLab", detail: "One flow for PRs and MRs." },
  { icon: Clock, label: "Local history", detail: "Reopen past reviews instantly." },
];

const WORKFLOW_STEPS = [
  {
    icon: GitBranch,
    title: "Paste the PR or MR",
    description: "Start with the review link instead of a long form or heavyweight integration.",
  },
  {
    icon: Sparkles,
    title: "Generate the signal you need",
    description: "Run fast summaries first, then trigger deeper review only when the change deserves it.",
  },
  {
    icon: Search,
    title: "Turn findings into action",
    description: "Use issue breakdowns, requirement checks, and comment-ready output to tighten feedback loops.",
  },
];

const FEATURE_SPOTLIGHTS = [
  {
    icon: FileText,
    title: "Change summary with intent",
    description: "Show what changed, why it matters, and where the risky files live before humans even start reading.",
  },
  {
    icon: Layers,
    title: "Execution flow mapping",
    description: "Expose route-to-service-to-data-layer impact so large changes feel reviewable instead of noisy.",
  },
  {
    icon: Search,
    title: "Confidence-scored findings",
    description: "Surface severity, rationale, evidence, and verification signal instead of generic AI commentary.",
  },
  {
    icon: ListChecks,
    title: "Requirements and follow-up checks",
    description: "Compare implementation against linked issues, review the MR description, and prep posting back to the platform.",
  },
];

const PREVIEW_FINDINGS = [
  {
    title: "Null state can bypass issue rendering",
    severity: "High",
    note: "Guard the selected issue branch before reading nested data.",
  },
  {
    title: "Repo token storage copy is easy to miss",
    severity: "Medium",
    note: "Clarify session vs persistent storage before users save credentials.",
  },
  {
    title: "Summary-first mode saves cost on large diffs",
    severity: "Insight",
    note: "Good default for first-pass triage and reruns.",
  },
];

function SetupOptionCard({
  title,
  subtitle,
  description,
  icon: Icon,
  open,
  highlighted = false,
  onClick,
}: {
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`group h-full min-h-[124px] rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
        open
          ? "border-foreground/15 bg-card shadow-[0_18px_50px_-28px_hsl(220_13%_18%_/_0.35)]"
          : "border-border/80 bg-background/80 hover:-translate-y-0.5 hover:border-foreground/20"
      } ${highlighted ? "bg-accent/5 ring-1 ring-accent/20" : ""}`}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                highlighted ? "border-accent/25 bg-accent/10" : "border-border bg-secondary/70 group-hover:border-foreground/15"
              }`}
            >
              <Icon size={17} className={highlighted ? "text-accent" : "text-muted-foreground"} />
            </div>
            <div>
              <span className="text-base font-semibold text-foreground">{title}</span>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {open ? <ChevronUp size={14} className="mt-1 text-muted-foreground" /> : <ChevronDown size={14} className="mt-1 text-muted-foreground" />}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function InputForm({ onSubmit, isLoading, theme, onThemeChange, onLoadHistory, onClearHistory }: InputFormProps) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showIssueInput, setShowIssueInput] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showRepoContext, setShowRepoContext] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(false);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [issueUrl, setIssueUrl] = useState("");
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const repoKey = getRepoKeyFromUrl(url);

  useEffect(() => {
    getHistory().then((entries) => setHistory(entries));
  }, []);

  useEffect(() => {
    setAiConfig((current) => resolveAIConfigForRepo(current, repoKey));
  }, [repoKey]);

  useEffect(() => {
    if (!repoKey) return;
    const storedToken = loadStoredRepoToken(repoKey);
    if (storedToken?.token) {
      setToken(storedToken.token);
      setRememberToken(storedToken.persistence === "persistent");
      setHasSavedToken(true);
      setShowToken(true);
      return;
    }

    setHasSavedToken(false);
  }, [repoKey]);

  useEffect(() => {
    if (!aiConfig.apiKey.trim()) {
      setShowAISettings(false);
    }
  }, [aiConfig.apiKey]);

  useEffect(() => {
    if (issueUrl.trim()) {
      setShowIssueInput(true);
    }
  }, [issueUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (needsApiKey) {
      setShowSetupWizard(true);
      return;
    }
    const trimmedToken = token.trim();
    if (repoKey && trimmedToken) {
      saveStoredRepoToken(repoKey, trimmedToken, rememberToken ? "persistent" : "session");
      setHasSavedToken(true);
    }
    onSubmit({ url: url.trim(), token: trimmedToken || undefined, aiConfig, issueUrl: issueUrl.trim() || undefined, forceRefresh: false });
  };

  const handleCompleteSetup = (payload: {
    config: AIConfig;
    token: string;
    rememberToken: boolean;
  }) => {
    setAiConfig(payload.config);
    setToken(payload.token);
    setRememberToken(payload.rememberToken);
    saveAIConfig(payload.config);

    if (repoKey) {
      saveRepoDefaults(repoKey, {
        model: payload.config.model,
        auxiliaryModel: payload.config.auxiliaryModel ?? "",
        customRules: payload.config.customRules ?? "",
        repoMemory: payload.config.repoMemory ?? "",
        postingMode: payload.config.postingMode ?? "inline",
        analysisStartMode: payload.config.analysisStartMode ?? "summary-and-flow",
        reviewMode: payload.config.reviewMode ?? "deep",
        lastPresetId: payload.config.lastPresetId,
      });

      if (payload.token) {
        saveStoredRepoToken(repoKey, payload.token, payload.rememberToken ? "persistent" : "session");
        setHasSavedToken(true);
      } else {
        clearStoredRepoToken(repoKey);
        setHasSavedToken(false);
      }
    }

    if (payload.token) {
      setShowToken(true);
    }

    setShowSetupWizard(false);
    if (url.trim() && isValidUrl && !isLoading) {
      onSubmit({
        url: url.trim(),
        token: payload.token || undefined,
        aiConfig: payload.config,
        issueUrl: issueUrl.trim() || undefined,
        forceRefresh: false,
      });
      return;
    }

    toast.success("Setup saved. You’re ready to review.");
  };

  const isValidUrl = url.includes("github.com") || url.includes("gitlab.com");
  const platformLabel = url.includes("gitlab.com") ? "GitLab" : url.includes("github.com") ? "GitHub" : "GitHub or GitLab";
  const needsApiKey = !aiConfig.apiKey.trim();
  const displayedHistory = showAllHistory ? history : history.slice(0, 5);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 -z-20"
          style={{
            background:
              "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background)) 55%, hsl(var(--secondary) / 0.45) 100%)",
          }}
        />
        <div
          className="absolute inset-0 -z-10 opacity-80"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 14% 20%, hsl(var(--accent) / 0.16), transparent 26%)",
              "radial-gradient(circle at 85% 12%, hsl(var(--foreground) / 0.08), transparent 22%)",
              "radial-gradient(circle at 50% 100%, hsl(var(--accent) / 0.1), transparent 32%)",
              "linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px)",
              "linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "auto, auto, auto, 48px 48px, 48px 48px",
            backgroundPosition: "center, center, center, center, center",
            maskImage: "linear-gradient(180deg, white 0%, rgba(255,255,255,0.92) 55%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(180deg, white 0%, rgba(255,255,255,0.92) 55%, transparent 100%)",
          }}
        />

        <header className="relative border-b border-border/70 bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                <GitPullRequest size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-foreground">AI Code Reviewer</p>
                <p className="text-xs text-muted-foreground">Review workspace for GitHub PRs and GitLab MRs</p>
              </div>
            </div>

            <div className="ml-auto hidden items-center gap-2 lg:flex">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <Icon size={12} className="text-accent" />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </div>
        </header>

        <main className="relative px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:pb-24 lg:pt-16">
          <div className="mx-auto max-w-6xl">
            <div className="space-y-10">
              <motion.section
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-8"
              >
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-medium text-foreground shadow-sm">
                    <Sparkles size={14} className="text-accent" />
                    Catch risky changes before human review slows down
                  </div>

                  <div className="space-y-4">
                    <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                      Review pull requests with <span className="font-serif italic text-accent">sharper signal</span> and less reviewer drag.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                      Paste a GitHub PR or GitLab MR to get change summaries, execution flow, and confidence-scored findings in one browser-first workspace.
                      Setup stays lightweight, and deeper options appear only when the review actually needs them.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {TRUST_POINTS.map(({ icon: Icon, label, detail }) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-border/80 bg-card/80 px-4 py-4 shadow-[0_12px_30px_-24px_hsl(220_13%_18%_/_0.3)] backdrop-blur"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <Icon size={18} />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[30px] border border-border/80 bg-card/95 p-5 shadow-[0_26px_70px_-36px_hsl(220_13%_18%_/_0.35)] backdrop-blur sm:p-6 lg:p-7"
                >
                  <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Start Here</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Drop in a PR link and get moving fast</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        The default path is intentionally lightweight: paste the URL, add your OpenRouter key once, and review with the recommended setup.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground">
                        <Cpu size={12} className={needsApiKey ? "text-muted-foreground" : "text-accent"} />
                        {needsApiKey ? "OpenRouter key needed" : "Saved AI settings ready"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground">
                        <Shield size={12} className="text-accent" />
                        Tokens only if you need private access
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5 pt-5">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-foreground">Pull Request / Merge Request URL</label>
                        {isValidUrl && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                            <CheckCircle2 size={12} />
                            {platformLabel} link detected
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <GitBranch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://github.com/owner/repo/pull/123"
                          className="w-full rounded-2xl border border-border bg-background px-12 py-4 text-sm text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isLoading}
                          required
                        />
                      </div>

                      {url && !isValidUrl && (
                        <p className="mt-2 text-xs text-destructive">Please enter a valid GitHub or GitLab URL.</p>
                      )}
                    </div>

                    <div className="rounded-[24px] border border-border/80 bg-secondary/25 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Review Context</p>
                          <p className="mt-2 text-sm font-medium text-foreground">Give the reviewer the context it needs for stronger comments.</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Related issues and repo context are review-specific helpers, so they belong here with the MR link instead of hidden in setup.
                          </p>
                        </div>
                        <span className="inline-flex w-fit items-center rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                          Recommended for better results
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setShowIssueInput((open) => !open)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            showIssueInput || issueUrl.trim()
                              ? "border-accent/25 bg-accent/5"
                              : "border-border bg-background hover:border-foreground/20 hover:bg-card"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <ListChecks size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">Related issue</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Optional but visible</p>
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${issueUrl.trim() ? "border border-accent/20 bg-accent/10 text-accent" : "border border-border bg-secondary/60 text-muted-foreground"}`}>
                              {issueUrl.trim() ? "Attached" : "Add link"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Best when the review needs requirement coverage or MR description validation against a linked issue.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowRepoContext((open) => !open)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            showRepoContext || aiConfig.repoMemory?.trim()
                              ? "border-accent/25 bg-accent/5"
                              : "border-border bg-background hover:border-foreground/20 hover:bg-card"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <BookOpenText size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">Repo context</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Recommended</p>
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${aiConfig.repoMemory?.trim() ? "border border-accent/20 bg-accent/10 text-accent" : "border border-border bg-secondary/60 text-muted-foreground"}`}>
                              {aiConfig.repoMemory?.trim() ? "Loaded" : "Add context"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Helpful for higher-quality review comments because it tells the model how this repo works, what matters, and what not to over-flag.
                          </p>
                        </button>
                      </div>

                      {showIssueInput && (
                        <div className="mt-4 rounded-2xl border border-border/80 bg-background/70 p-3">
                          <label className="mb-2 block text-sm font-medium text-foreground">Related issue link</label>
                          <div className="relative">
                            <ListChecks size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type="url"
                              value={issueUrl}
                              onChange={(e) => setIssueUrl(e.target.value)}
                              placeholder="Optional: add a GitLab or GitHub issue URL for requirement checks"
                              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                              disabled={isLoading}
                            />
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            Optional and review-specific. Add it only when you want requirement coverage or MR description checks for this change.
                          </p>
                        </div>
                      )}

                      {showRepoContext && (
                        <div className="mt-4">
                          <RepoContextSettings
                            config={aiConfig}
                            onChange={setAiConfig}
                            disabled={isLoading}
                            repoUrl={isValidUrl ? url.trim() : undefined}
                            repoToken={token.trim() || undefined}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="submit"
                        disabled={isLoading || !url.trim() || !isValidUrl}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,hsl(142_71%_45%)_0%,hsl(160_84%_39%)_100%)] px-5 py-4 text-sm font-semibold text-white shadow-[0_24px_44px_-26px_hsl(142_71%_45%_/_0.8)] transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                      >
                        {isLoading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={15} />
                            <span>{needsApiKey ? "Complete Setup to Review" : "Review This PR"}</span>
                            <ArrowRight size={15} />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSetupWizard(true)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3.5 text-sm font-medium text-foreground transition-all hover:border-foreground/20 hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Cpu size={15} />
                        <span>{needsApiKey ? "Setup Once" : "Edit Setup"}</span>
                      </button>
                    </div>

                    <div className="rounded-[24px] border border-border/80 bg-secondary/35 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Setup Snapshot</p>
                          <p className="mt-2 text-sm font-medium text-foreground">
                            {needsApiKey ? "Complete the one-time setup and we’ll walk you through it step by step." : "Your one-time setup is done. Review now and open advanced options only if this PR needs extra context."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedSetup((open) => !open)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          {showAdvancedSetup ? "Hide Advanced Setup" : "Advanced Setup"}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-card/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Reviewer</p>
                          <p className="mt-1 text-sm text-foreground">{needsApiKey ? "Needs setup" : "Ready to run"}</p>
                        </div>
                        <div className="rounded-xl bg-card/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Private Access</p>
                          <p className="mt-1 text-sm text-foreground">{token.trim() ? "Configured" : "Optional"}</p>
                        </div>
                        <div className="rounded-xl bg-card/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Linked Issue</p>
                          <p className="mt-1 text-sm text-foreground">{issueUrl.trim() ? "Attached" : "Optional"}</p>
                        </div>
                      </div>
                    </div>

                    {showAdvancedSetup && (
                      <div className="rounded-[28px] border border-border/80 bg-secondary/30 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Advanced setup</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Keep the page clean up front. Open only the configuration sections that add value for this review.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-medium text-accent">Step 1: AI reviewer</span>
                          <span className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">Step 2: Optional context</span>
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        <div className="rounded-3xl border border-accent/20 bg-accent/5 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Required First</p>
                              <p className="mt-1 text-sm text-foreground">Set up the AI reviewer before running analysis.</p>
                            </div>
                            <span className="inline-flex w-fit items-center rounded-full border border-accent/20 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-accent">
                              {needsApiKey ? "Needs attention" : "Configured"}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-1">
                            <SetupOptionCard
                              title="AI Settings"
                              subtitle="Recommended first step"
                              description={needsApiKey ? "Add your OpenRouter key, choose a model, and save your default review style." : "Using saved model, review depth, and API key."}
                              icon={Cpu}
                              open={showAISettings}
                              highlighted={needsApiKey}
                              onClick={() => setShowAISettings((open) => !open)}
                            />
                          </div>
                          {showAISettings && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              transition={{ duration: 0.22 }}
                              className="mt-4 overflow-hidden rounded-2xl border border-border bg-card p-4"
                            >
                              <div className="mb-3">
                                <p className="text-sm font-semibold text-foreground">AI setup</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Required. Your OpenRouter key stays in this browser, and most teams can keep the recommended defaults.
                                </p>
                              </div>
                              <AISettings config={aiConfig} onChange={setAiConfig} disabled={isLoading} repoKey={repoKey} />
                            </motion.div>
                          )}
                        </div>

                        <div className="rounded-3xl border border-border bg-background/50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Private Access</p>
                              <p className="mt-1 text-sm text-foreground">Keep durable defaults here, and add private repo access only when this review needs it.</p>
                            </div>
                            <span className="inline-flex w-fit items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                              Open only if needed
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-4">
                            <SetupOptionCard
                              title="Access Token"
                              subtitle="Private repos or posting"
                              description="Use only when you need private diff access or want to publish review comments back later."
                              icon={Key}
                              open={showToken}
                              onClick={() => setShowToken((open) => !open)}
                            />
                          </div>
                          {showToken && (
                            <div className="mt-4 space-y-4">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.22 }}
                                className="overflow-hidden rounded-2xl border border-border bg-card p-4"
                              >
                                <div className="mb-3">
                                  <p className="text-sm font-semibold text-foreground">Access token</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Optional. Add a token for private {platformLabel} repos or if you want to post review comments back later.
                                  </p>
                                </div>
                                <div className="relative">
                                  <Shield size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                  <input
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="ghp_xxxx or glpat-xxxx"
                                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
                                    disabled={isLoading}
                                  />
                                </div>
                                <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={rememberToken}
                                    onChange={(e) => setRememberToken(e.target.checked)}
                                    className="mt-0.5 rounded border-border bg-background"
                                    disabled={isLoading}
                                  />
                                  <span>
                                    Remember on this device for this repo. If unchecked, the token is saved only for this browser session.
                                  </span>
                                </label>
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Shield size={11} />
                                    {rememberToken
                                      ? "Stored in this browser until you clear it. Avoid using this on shared devices."
                                      : "Stored only until this browser session ends."}
                                  </p>
                                  {hasSavedToken && repoKey && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        clearStoredRepoToken(repoKey);
                                        setToken("");
                                        setRememberToken(false);
                                        setHasSavedToken(false);
                                      }}
                                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                      Forget saved token
                                    </button>
                                  )}
                                </div>
                                {platformLabel === "GitLab" && (
                                  <a
                                    href="https://docs.gitlab.com/user/profile/personal_access_tokens/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <Key size={11} />
                                    How to create a GitLab personal access token
                                  </a>
                                )}
                              </motion.div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Sample Links</span>
                        <span className="text-xs text-muted-foreground">Try the interface with a public PR or MR.</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {EXAMPLE_URLS.map((exUrl) => (
                          <button
                            key={exUrl}
                            type="button"
                            onClick={() => setUrl(exUrl)}
                            disabled={isLoading}
                            className="max-w-[290px] truncate rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition-all hover:border-foreground/20 hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            title={exUrl}
                          >
                            {exUrl.replace("https://", "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                </motion.div>
              </motion.section>

              <motion.aside
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto max-w-4xl"
              >
                <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,#101a2d_0%,#162032_45%,#0d1525_100%)] text-slate-100 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.75)]">
                  <div className="border-b border-white/10 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/90">Review Preview</p>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">A quick look at the kind of output you get</h3>
                      </div>
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                        Summary + review signal
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 px-5 py-5">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-200">Dashboard revamp for review quality</p>
                          <p className="mt-1 text-xs text-slate-400">32 changed files · summary-first mode · rerun comparison ready</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2 text-right">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Review Score</p>
                          <p className="mt-1 text-2xl font-semibold text-white">8.6</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <p className="text-slate-400">High-risk files</p>
                          <p className="mt-1 text-lg font-semibold text-white">3</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <p className="text-slate-400">Actionable issues</p>
                          <p className="mt-1 text-lg font-semibold text-white">7</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <p className="text-slate-400">Ready to post</p>
                          <p className="mt-1 text-lg font-semibold text-white">4 comments</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Top findings</p>
                        <span className="text-xs text-slate-400">Confidence-scored</span>
                      </div>

                      <div className="space-y-3">
                        {PREVIEW_FINDINGS.map((finding) => {
                          const toneClass =
                            finding.severity === "High"
                              ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                              : finding.severity === "Medium"
                                ? "border-sky-300/20 bg-sky-300/10 text-sky-100"
                                : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";

                          return (
                            <div key={finding.title} className="rounded-2xl border border-white/10 bg-[#10192b] px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-white">{finding.title}</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-400">{finding.note}</p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
                                  {finding.severity}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-200">
                          <Layers size={18} />
                        </div>
                        <p className="text-sm font-semibold text-white">Execution flow snapshot</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">Route to controller to service to DAL makes the risky path obvious at a glance.</p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-200">
                          <ListChecks size={18} />
                        </div>
                        <p className="text-sm font-semibold text-white">Follow-up tools</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">Run requirement checks, improve MR copy, and prep review comments only when needed.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.aside>
            </div>

            {history.length > 0 && onLoadHistory && (
              <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.45 }}
                className="mt-12 rounded-[30px] border border-border/80 bg-card/90 p-5 shadow-[0_24px_60px_-36px_hsl(220_13%_18%_/_0.35)] backdrop-blur sm:p-6"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Keep Momentum</p>
                    <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                      <Clock size={16} className="text-accent" />
                      Recent reviews
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">Jump back into prior analysis without starting over.</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {history.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllHistory((current) => !current)}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showAllHistory ? "Show Less" : "View All"}
                      </button>
                    )}
                    {onClearHistory && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!history.length) return;
                          if (!window.confirm("Delete all saved review history? This cannot be undone.")) return;
                          await onClearHistory();
                          setHistory([]);
                          setShowAllHistory(false);
                        }}
                        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div className={`space-y-3 ${showAllHistory ? "max-h-[28rem] overflow-y-auto pr-1" : ""}`}>
                  {displayedHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-background/70 px-4 py-3 transition-all hover:border-foreground/20 hover:bg-card"
                    >
                      <button
                        onClick={() => onLoadHistory(entry)}
                        className="min-w-0 flex-1 text-left"
                        disabled={isLoading}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{entry.prTitle}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className={entry.url.includes("github") ? "text-foreground" : "text-orange-500"}>
                            {entry.url.includes("github") ? "GitHub" : "GitLab"}
                          </span>
                          <span>·</span>
                          <span>{entry.model}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}</span>
                          {entry.state.codeReview && (
                            <>
                              <span>·</span>
                              <span className="font-medium text-foreground">{entry.state.codeReview.overallScore}/10</span>
                            </>
                          )}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete "${entry.prTitle}" from saved review history? This cannot be undone.`)) {
                            return;
                          }
                          const deleted = await deleteAnalysis(entry.id);
                          const refreshedHistory = await getHistory();
                          setHistory(refreshedHistory);
                          if (refreshedHistory.length <= 5) {
                            setShowAllHistory(false);
                          }
                          if (deleted && !refreshedHistory.some((savedEntry) => savedEntry.id === entry.id)) {
                            toast.success("Deleted saved review.");
                          } else {
                            toast.error("Could not delete that saved review.");
                          }
                        }}
                        className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.45 }}
              className="mt-12"
            >
              <div className="mb-6 max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">How It Works</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">A clearer path from URL to useful review output</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The landing page should reassure new users that the workflow is fast, controlled, and geared toward better reviewer decisions.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {WORKFLOW_STEPS.map(({ icon: Icon, title, description }, index) => (
                  <div
                    key={title}
                    className="rounded-[28px] border border-border/80 bg-card/90 p-5 shadow-[0_20px_45px_-35px_hsl(220_13%_18%_/_0.35)]"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Icon size={18} />
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="text-lg font-semibold tracking-tight text-foreground">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.45 }}
              className="mt-12"
            >
              <div className="mb-6 max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">What You Get</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Features that feel specific, not interchangeable</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  These are the capabilities worth surfacing on the landing page because they explain why this product is more than a generic AI prompt box.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {FEATURE_SPOTLIGHTS.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-[28px] border border-border/80 bg-card/90 p-5 shadow-[0_20px_45px_-35px_hsl(220_13%_18%_/_0.35)]"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-foreground">
                      <Icon size={20} />
                    </div>
                    <p className="text-lg font-semibold tracking-tight text-foreground">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </motion.section>
          </div>
        </main>
      </div>
      <SetupWizard
        open={showSetupWizard}
        config={aiConfig}
        token={token}
        rememberToken={rememberToken}
        platformLabel={platformLabel}
        onClose={() => setShowSetupWizard(false)}
        onComplete={handleCompleteSetup}
      />
    </div>
  );
}
