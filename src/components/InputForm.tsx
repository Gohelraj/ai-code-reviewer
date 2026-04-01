import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitPullRequest, Key, ChevronDown, ChevronUp, Sparkles, GitBranch, ArrowRight, Shield, FileText, Search, Layers, Clock, Trash2, ListChecks, Cpu, CheckCircle2, BookOpenText, type LucideIcon } from "lucide-react";
import { AISettings, loadAIConfig, resolveAIConfigForRepo } from "./AISettings";
import type { AIConfig } from "./AISettings";
import { RepoContextSettings } from "./RepoContextSettings";
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
}

const EXAMPLE_URLS = [
  "https://github.com/facebook/react/pull/28123",
  "https://github.com/vercel/next.js/pull/54321",
  "https://gitlab.com/gitlab-org/gitlab/-/merge_requests/12345",
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
      className={`h-full min-h-[118px] rounded-xl border px-5 py-4 text-left transition-all hover:-translate-y-0.5 ${open ? "border-foreground/20 bg-card shadow-sm" : "border-border bg-background hover:border-foreground/20"} ${highlighted ? "ring-1 ring-accent/20" : ""}`}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${highlighted ? "border-accent/20 bg-accent/10" : "border-border bg-secondary/70"}`}>
              <Icon size={16} className={highlighted ? "text-accent" : "text-muted-foreground"} />
            </div>
            <div>
              <span className="text-base font-semibold text-foreground">{title}</span>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {open ? <ChevronUp size={14} className="mt-1 text-muted-foreground" /> : <ChevronDown size={14} className="mt-1 text-muted-foreground" />}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function InputForm({ onSubmit, isLoading, theme, onThemeChange, onLoadHistory }: InputFormProps) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showAISettings, setShowAISettings] = useState(false);
  const [showRepoContext, setShowRepoContext] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [rememberToken, setRememberToken] = useState(false);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [issueUrl, setIssueUrl] = useState("");
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const repoKey = getRepoKeyFromUrl(url);

  useEffect(() => {
    getHistory().then((entries) => setHistory(entries.slice(0, 5)));
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
      setShowAISettings(true);
    }
  }, [aiConfig.apiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    const trimmedToken = token.trim();
    if (repoKey && trimmedToken) {
      saveStoredRepoToken(repoKey, trimmedToken, rememberToken ? "persistent" : "session");
      setHasSavedToken(true);
    }
    onSubmit({ url: url.trim(), token: trimmedToken || undefined, aiConfig, issueUrl: issueUrl.trim() || undefined, forceRefresh: false });
  };

  const isValidUrl = url.includes("github.com") || url.includes("gitlab.com");
  const platformLabel = url.includes("gitlab.com") ? "GitLab" : url.includes("github.com") ? "GitHub" : "GitHub or GitLab";
  const needsApiKey = !aiConfig.apiKey.trim();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
            <GitPullRequest size={16} className="text-background" />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-lg">AI Code Reviewer</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-5xl"
        >
          {/* Pill badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-sm text-muted-foreground">
              <Sparkles size={13} className="text-accent" />
              <span>Senior engineer code review, automated</span>
            </div>
          </div>

          <div className="mx-auto mb-12 w-full max-w-4xl px-3 sm:px-6 lg:px-7">
            <h1 className="mx-auto max-w-[920px] text-3xl sm:text-4xl md:text-5xl font-bold text-center text-foreground mb-4 leading-tight tracking-tight">
              Start with the PR or MR
              <br />
              <span style={{ color: "hsl(142 71% 45%)" }}>then add details only if you need them</span>
            </h1>

            <p className="mx-auto max-w-[860px] text-center text-muted-foreground text-lg leading-relaxed">
              Paste a GitHub PR or GitLab MR link to begin. Tokens, requirement checks,
              and AI customization are available as guided setup instead of upfront clutter.
            </p>
          </div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-4xl bg-card border border-border rounded-2xl p-5 sm:p-6 lg:p-7 shadow-lg"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Pull Request / Merge Request URL
                </label>
                <div className="relative">
                  <GitBranch size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo/pull/123"
                    className="w-full pl-10 pr-4 py-3 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/60 text-foreground"
                    disabled={isLoading}
                    required
                  />
                </div>
                {url && !isValidUrl && (
                  <p className="text-xs text-destructive mt-1.5">
                    Please enter a valid GitHub or GitLab URL
                  </p>
                )}
                {isValidUrl && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                      <CheckCircle2 size={12} className="text-accent" />
                      {platformLabel} link detected
                    </span>
                    <span>Next: use recommended AI settings or open guided setup below.</span>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Guided setup</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Start simple. Open only the setup sections you need for this review.
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {needsApiKey ? "AI settings required before first analysis" : "Recommended AI settings ready"}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Required First</p>
                        <p className="mt-1 text-sm text-foreground">Set up the AI reviewer before running analysis.</p>
                      </div>
                      <span className="inline-flex w-fit items-center rounded-full border border-accent/20 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-accent">
                        Step 1
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1">
                      <SetupOptionCard
                        title="AI Settings"
                        subtitle="Recommended first step"
                        description={needsApiKey ? "Add your OpenRouter key and choose a model." : "Using saved model and API key."}
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
                        transition={{ duration: 0.2 }}
                        className="mt-4 rounded-xl border border-border bg-card p-4"
                      >
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-foreground">AI setup</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Required. Your OpenRouter key stays in this browser, and most users can keep the recommended defaults.
                          </p>
                        </div>
                        <AISettings config={aiConfig} onChange={setAiConfig} disabled={isLoading} repoKey={repoKey} />
                      </motion.div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Optional Extras</p>
                        <p className="mt-1 text-sm text-foreground">Add project context or access only when this review needs it.</p>
                      </div>
                      <span className="inline-flex w-fit items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        Step 2
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:auto-rows-fr">
                      <SetupOptionCard
                        title="Repo Context"
                        subtitle="Project-aware review guidance"
                        description="Stable repo purpose, patterns, and review guidance."
                        icon={BookOpenText}
                        open={showRepoContext}
                        onClick={() => setShowRepoContext((open) => !open)}
                      />
                      <SetupOptionCard
                        title="Access Token"
                        subtitle="Only if you need it"
                        description="Private repos and comment posting."
                        icon={Key}
                        open={showToken}
                        onClick={() => setShowToken((open) => !open)}
                      />
                      <SetupOptionCard
                        title="Linked Issue"
                        subtitle="For requirement coverage"
                        description="Optional requirement coverage checks."
                        icon={ListChecks}
                        open={showIssue}
                        onClick={() => setShowIssue((open) => !open)}
                      />
                    </div>
                    {(showRepoContext || showToken || showIssue) && (
                      <div className="mt-4 space-y-4">
                        {showRepoContext && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            transition={{ duration: 0.2 }}
                          >
                            <RepoContextSettings
                              config={aiConfig}
                              onChange={setAiConfig}
                              disabled={isLoading}
                              repoUrl={isValidUrl ? url.trim() : undefined}
                              repoToken={token.trim() || undefined}
                            />
                          </motion.div>
                        )}

                        {showToken && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            transition={{ duration: 0.2 }}
                            className="rounded-xl border border-border bg-card p-4"
                          >
                            <div className="mb-3">
                              <p className="text-sm font-semibold text-foreground">Access token</p>
                              <p className="text-xs text-muted-foreground mt-1">
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
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/60 text-foreground"
                                disabled={isLoading}
                              />
                            </div>
                            <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
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
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
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
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Key size={11} />
                                How to create a GitLab personal access token
                              </a>
                            )}
                          </motion.div>
                        )}

                        {showIssue && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            transition={{ duration: 0.2 }}
                            className="rounded-xl border border-border bg-card p-4"
                          >
                            <div className="mb-3">
                              <p className="text-sm font-semibold text-foreground">Linked issue</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Optional. Add a GitHub issue or GitLab issue/work item to run requirement coverage checks after analysis.
                              </p>
                            </div>
                            <div className="relative">
                              <ListChecks size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="url"
                                value={issueUrl}
                                onChange={(e) => setIssueUrl(e.target.value)}
                                placeholder="https://gitlab.com/group/project/-/issues/123"
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/60 text-foreground"
                                disabled={isLoading}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                              Requirements check and MR description review are run on demand, so adding an issue here does not increase the initial analysis cost.
                            </p>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !url.trim() || !isValidUrl || !aiConfig.apiKey.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>{needsApiKey ? "Continue to Analysis" : "Analyze with AI"}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                The fastest path is: paste a URL, add your OpenRouter key once, then keep the recommended setup. Tokens and linked issues are optional.
              </p>
            </form>
          </motion.div>

          {/* Example URLs */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground mb-3">Try with a public PR:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_URLS.map((exUrl) => (
                <button
                  key={exUrl}
                  onClick={() => setUrl(exUrl)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-all truncate max-w-[280px] disabled:opacity-50"
                  title={exUrl}
                >
                  {exUrl.replace("https://", "")}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Recent analyses */}
        {history.length > 0 && onLoadHistory && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.45 }}
            className="mt-12 w-full max-w-4xl"
          >
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              Recent Reviews
            </h3>
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-foreground/20 transition-all group"
                >
                  <button
                    onClick={() => onLoadHistory(entry)}
                    className="flex-1 text-left min-w-0"
                    disabled={isLoading}
                  >
                    <p className="text-sm font-medium text-foreground truncate">{entry.prTitle}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
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
                          <span className="font-medium">{entry.state.codeReview.overallScore}/10</span>
                        </>
                      )}
                    </p>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteAnalysis(entry.id);
                      setHistory((h) => h.filter((x) => x.id !== entry.id));
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl w-full px-4"
        >
          {[
            {
              icon: FileText,
              color: "bg-accent/10 text-accent",
              title: "Change Summary",
              desc: "Understand what changed and why, with file-by-file breakdown and impact levels."
            },
            {
              icon: Layers,
              color: "bg-blue-500/10 text-blue-500",
              title: "Execution Flow",
              desc: "See changes ordered by how data flows: Route → Controller → Service → DAL."
            },
            {
              icon: Search,
              color: "bg-purple-500/10 text-purple-500",
              title: "Senior Review",
              desc: "Critical issues, security concerns, and improvement suggestions from an AI senior engineer."
            }
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-card border border-border rounded-xl p-5 text-center hover:border-foreground/20 hover:shadow-md transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl ${feature.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </motion.div>
      </main>
    </div>
  );
}
