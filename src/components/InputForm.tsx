import { useState } from "react";
import { motion } from "framer-motion";
import { GitPullRequest, Key, ChevronDown, ChevronUp, Sparkles, GitBranch, ArrowRight, Shield } from "lucide-react";
import { AISettings, loadAIConfig } from "./AISettings";
import type { AIConfig } from "./AISettings";

export interface SubmitPayload {
  url: string;
  token?: string;
  aiConfig: AIConfig;
}

interface InputFormProps {
  onSubmit: (payload: SubmitPayload) => void;
  isLoading: boolean;
}

const EXAMPLE_URLS = [
  "https://github.com/facebook/react/pull/28123",
  "https://github.com/vercel/next.js/pull/54321",
  "https://gitlab.com/gitlab-org/gitlab/-/merge_requests/12345",
];

export function InputForm({ onSubmit, isLoading }: InputFormProps) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit({ url: url.trim(), token: token.trim() || undefined, aiConfig });
  };

  const isValidUrl = url.includes("github.com") || url.includes("gitlab.com");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
            <GitPullRequest size={16} className="text-background" />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-lg">MergeAI Reviewer</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              Powered by AI
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl"
        >
          {/* Pill badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-sm text-muted-foreground">
              <Sparkles size={13} className="text-accent" />
              <span>Senior engineer code review, automated</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-center text-foreground mb-4 leading-tight tracking-tight">
            Review merge requests
            <br />
            <span style={{ color: "hsl(142 71% 45%)" }}>10× faster</span> with AI
          </h1>

          <p className="text-center text-muted-foreground text-lg mb-12 leading-relaxed">
            Paste a GitHub PR or GitLab MR link. Get instant change summaries,
            logical execution flow, and a detailed senior-level code review.
          </p>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card border border-border rounded-2xl p-6 shadow-lg"
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
              </div>

              {/* Optional token */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Key size={12} />
                  <span>Access token (for private repos)</span>
                  {showToken ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showToken && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2"
                  >
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
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Shield size={11} />
                      Token is sent securely and never stored
                    </p>
                  </motion.div>
                )}
              </div>

              {/* AI Settings */}
              <AISettings config={aiConfig} onChange={setAiConfig} disabled={isLoading} />

              <button
                type="submit"
                disabled={isLoading || !url.trim() || !isValidUrl}
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
                    <span>Analyze with AI</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
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

        {/* Feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full px-4"
        >
          {[
            {
              icon: "📋",
              title: "Change Summary",
              desc: "Understand what changed and why, with file-by-file breakdown and impact levels."
            },
            {
              icon: "🔄",
              title: "Execution Flow",
              desc: "See changes ordered by how data flows: Route → Controller → Service → DAL."
            },
            {
              icon: "🔍",
              title: "Senior Review",
              desc: "Critical issues, security concerns, and improvement suggestions from an AI senior engineer."
            }
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-card border border-border rounded-xl p-4 text-center"
            >
              <div className="text-2xl mb-2">{feature.icon}</div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
