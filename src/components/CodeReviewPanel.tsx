import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield, Zap, CheckCircle2, XCircle, AlertTriangle, MessageSquare,
  ChevronDown, ChevronUp, Copy, Check, Star, BookOpen, Lock, Gauge
} from "lucide-react";
import type { CodeReview, ReviewIssue } from "../types";

interface CodeReviewPanelProps {
  review: CodeReview;
}

type SeverityConfigEntry = { icon: typeof XCircle; label: string; bg: string; border: string; text: string; badge: string };
const SEVERITY_CONFIG: Record<string, SeverityConfigEntry> = {
  critical: { icon: XCircle, label: "Critical", bg: "bg-destructive/10", border: "border-destructive/20", text: "text-destructive", badge: "bg-destructive text-background" },
  warning: { icon: AlertTriangle, label: "Warning", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400", badge: "bg-yellow-500 text-background" },
  suggestion: { icon: MessageSquare, label: "Suggestion", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20", text: "text-blue-600 dark:text-blue-400", badge: "bg-blue-500 text-background" },
  nitpick: { icon: MessageSquare, label: "Nitpick", bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
  info: { icon: MessageSquare, label: "Info", bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
};
const DEFAULT_SEVERITY = SEVERITY_CONFIG.suggestion;

type VerdictConfigEntry = { label: string; icon: typeof CheckCircle2; color: string; bg: string };
const VERDICT_CONFIG: Record<string, VerdictConfigEntry> = {
  approve: { label: "Approved", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  approve_with_suggestions: { label: "Approved with suggestions", icon: CheckCircle2, color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20" },
  request_changes: { label: "Changes requested", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
  needs_discussion: { label: "Needs discussion", icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20" },
};
const DEFAULT_VERDICT = VERDICT_CONFIG.needs_discussion;

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-accent" : score >= 6 ? "bg-yellow-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-sm font-bold text-foreground w-8">{score}/10</span>
    </div>
  );
}

function CodeBlock({ code, label, variant = "neutral" }: { code: string; label: string; variant?: "destructive" | "accent" | "neutral" }) {
  const [copied, setCopied] = useState(false);
  const colorMap = {
    destructive: "border-destructive/20 bg-destructive/5",
    accent: "border-accent/20 bg-accent/5",
    neutral: "border-border bg-secondary/50",
  };
  const textMap = {
    destructive: "text-destructive dark:text-red-400",
    accent: "text-accent dark:text-emerald-400",
    neutral: "text-foreground",
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
        >
          {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className={`relative rounded-xl border ${colorMap[variant]} overflow-hidden`}>
        <pre className={`text-xs font-mono p-4 overflow-x-auto whitespace-pre leading-relaxed ${textMap[variant]}`}><code>{code.trim()}</code></pre>
      </div>
    </div>
  );
}

function IssueCard({ issue, index }: { issue: ReviewIssue; index: number }) {
  const [expanded, setExpanded] = useState(issue.severity === "critical");
  const config = SEVERITY_CONFIG[issue.severity] ?? DEFAULT_SEVERITY;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`border rounded-2xl overflow-hidden ${config.border} bg-card`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
      >
        <Icon size={16} className={`flex-shrink-0 mt-0.5 ${config.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${config.badge}`}>
              {issue.severity.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-secondary border border-border">
              {issue.category}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{issue.title}</p>
          {issue.file && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md truncate max-w-[300px]">
                {issue.file}{issue.lineHint ? ` · ${issue.lineHint}` : ""}
              </span>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className={`border-t px-5 py-5 space-y-5 ${config.border} ${config.bg}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Issue</p>
            <p className="text-sm text-foreground leading-relaxed">{issue.description}</p>
          </div>

          {issue.currentCode && (
            <CodeBlock code={issue.currentCode} label="Problematic Code" variant="destructive" />
          )}

          {issue.suggestedFix && (
            <CodeBlock code={issue.suggestedFix} label="Suggested Fix" variant="accent" />
          )}

          {issue.impact && (
            <div className="bg-muted/50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Impact</p>
              <p className="text-sm text-foreground leading-relaxed">{issue.impact}</p>
            </div>
          )}

          {issue.lineHint && !issue.file && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Location: </span>{issue.lineHint}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function CodeReviewPanel({ review }: CodeReviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const verdictConfig = VERDICT_CONFIG[review.overallVerdict] ?? DEFAULT_VERDICT;
  const VerdictIcon = verdictConfig.icon;

  const criticalCount = review.issues.filter((i) => i.severity === "critical").length;
  const warningCount = review.issues.filter((i) => i.severity === "warning").length;
  const suggestionCount = review.issues.filter((i) => i.severity === "suggestion" || i.severity === "nitpick").length;

  const copyReview = () => {
    const text = [
      `# Code Review: ${review.overallVerdict.toUpperCase()}`,
      `Score: ${review.overallScore}/10`,
      ``,
      `## Summary`,
      review.executiveSummary,
      ``,
      `## Issues (${review.issues.length} total)`,
      ...review.issues.map((i) => `### [${i.severity.toUpperCase()}] ${i.title}\n${i.description}\n\nFix: ${i.suggestedFix}`),
      ``,
      `## Strengths`,
      ...review.strengths.map((s) => `- ${s}`),
      ``,
      `## Merge Readiness`,
      review.mergeReadiness,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Verdict card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-6 pb-5">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Code Review Verdict</p>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${verdictConfig.bg} ${verdictConfig.color}`}>
                <VerdictIcon size={16} />
                {verdictConfig.label}
              </div>
            </div>
            <button
              onClick={copyReview}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
            >
              {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy Review"}
            </button>
          </div>

          {/* Score */}
          <div className="flex items-center gap-5 mb-6">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <motion.circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={review.overallScore >= 8 ? "hsl(var(--accent))" : review.overallScore >= 6 ? "hsl(38 92% 50%)" : "hsl(var(--destructive))"}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(review.overallScore / 10) * 213.6} 213.6`}
                  initial={{ strokeDasharray: "0 213.6" }}
                  animate={{ strokeDasharray: `${(review.overallScore / 10) * 213.6} 213.6` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-foreground">{review.overallScore}</span>
                <span className="text-xs text-muted-foreground">/10</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Star size={14} />
                Code Quality Score
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{review.executiveSummary}</p>
            </div>
          </div>

          {/* Issue summary pills */}
          <div className="flex gap-2.5 flex-wrap">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <XCircle size={13} className="text-destructive" />
                <span className="text-xs font-semibold text-destructive">{criticalCount} Critical</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20">
                <AlertTriangle size={13} className="text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">{warningCount} Warning{warningCount !== 1 ? "s" : ""}</span>
              </div>
            )}
            {suggestionCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20">
                <MessageSquare size={13} className="text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{suggestionCount} Suggestion{suggestionCount !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issues */}
      {review.issues.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Shield size={16} />
            Issues & Suggestions
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{review.issues.length}</span>
          </h3>
          <div className="space-y-3">
            {review.issues
              .sort((a, b) => {
                const order = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 };
                return order[a.severity] - order[b.severity];
              })
              .map((issue, i) => (
                <IssueCard key={issue.id} issue={issue} index={i} />
              ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {review.strengths.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-accent" />
            Strengths
          </h3>
          <div className="space-y-2.5">
            {review.strengths.map((strength, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 size={11} className="text-accent" />
                </div>
                <p className="text-sm text-foreground">{strength}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture + Security + Performance */}
      <div className="grid grid-cols-1 gap-4">
        {review.architectureObservations.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <BookOpen size={16} />
              Architecture Observations
            </h3>
            <div className="space-y-4">
              {review.architectureObservations.map((obs, i) => (
                <div key={i} className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">{obs.aspect}</p>
                  <p className="text-sm text-foreground leading-relaxed">{obs.observation}</p>
                  <div className="mt-2 flex items-start gap-1.5">
                    <span className="text-accent text-sm">→</span>
                    <p className="text-sm text-muted-foreground leading-relaxed">{obs.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {review.securityConsiderations.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lock size={14} />
                Security
              </h3>
              <ul className="space-y-2">
                {review.securityConsiderations.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <Shield size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.performanceConsiderations.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Gauge size={14} />
                Performance
              </h3>
              <ul className="space-y-2">
                {review.performanceConsiderations.map((p, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <Zap size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Testing + Merge Readiness */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">Testing Assessment</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{review.testingAssessment}</p>
          </div>
          <div className={`rounded-2xl p-5 border ${verdictConfig.bg}`}>
            <h3 className={`text-sm font-semibold mb-2 ${verdictConfig.color}`}>Merge Readiness</h3>
            <p className="text-sm text-foreground leading-relaxed">{review.mergeReadiness}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
