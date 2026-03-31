import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield, Zap, CheckCircle2, XCircle, AlertTriangle, MessageSquare,
  ChevronDown, ChevronUp, Copy, Check, Star, BookOpen, Lock, Gauge, Send, FileCode, MapPin,
  Square, CheckSquare, ListChecks, EyeOff, Eye, ClipboardCopy, Play, RefreshCw
} from "lucide-react";
import toast from "react-hot-toast";
import type { CodeReview, ReviewIssue, MRData } from "../types";
import { postReviewComment, postInlineComments, type InlinePostResult } from "../lib/github-comment";

interface CodeReviewPanelProps {
  review: CodeReview;
  prUrl?: string;
  prToken?: string;
  mrData?: MRData | null;
  previousReview?: CodeReview | null;
  reviewLoading?: boolean;
  onTriggerReview?: () => void;
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
        <pre className={`text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed ${textMap[variant]}`}><code>{code.trim()}</code></pre>
      </div>
    </div>
  );
}

/** Build markdown for a single issue */
function buildSingleIssueMarkdown(issue: ReviewIssue): string {
  const sevEmoji = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
  const lines: string[] = [];
  lines.push(`#### ${sevEmoji} [${issue.severity.toUpperCase()}] ${issue.title}`);
  lines.push(``);
  if (issue.file) {
    lines.push(`📁 \`${issue.file}\`${issue.lineHint ? ` · ${issue.lineHint}` : ""}`);
    lines.push(``);
  }
  if (issue.category) {
    lines.push(`**Category:** ${issue.category}`);
    lines.push(``);
  }
  lines.push(issue.description);
  lines.push(``);
  if (issue.currentCode) {
    lines.push(`**Problematic Code:**`);
    lines.push("```");
    lines.push(issue.currentCode.trim());
    lines.push("```");
    lines.push(``);
  }
  if (issue.suggestedFix) {
    lines.push(`**Suggested Fix:**`);
    lines.push("```");
    lines.push(issue.suggestedFix.trim());
    lines.push("```");
    lines.push(``);
  }
  if (issue.impact) {
    lines.push(`> **Impact:** ${issue.impact}`);
    lines.push(``);
  }
  return lines.join("\n");
}

function IssueCard({ issue, index, selected, onToggleSelect, dismissed, onDismiss, onRestore }: {
  issue: ReviewIssue;
  index: number;
  selected?: boolean;
  onToggleSelect?: () => void;
  dismissed?: boolean;
  onDismiss?: () => void;
  onRestore?: () => void;
}) {
  const [expanded, setExpanded] = useState(issue.severity === "critical" && !dismissed);
  const [issueCopied, setIssueCopied] = useState(false);
  const config = SEVERITY_CONFIG[issue.severity] ?? DEFAULT_SEVERITY;
  const Icon = config.icon;
  const showCheckbox = onToggleSelect !== undefined && !dismissed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`border rounded-2xl overflow-hidden ${config.border} bg-card ${issue.severity === "critical" && !dismissed ? "border-l-4 border-l-destructive" : ""} ${selected ? "ring-2 ring-primary/30" : ""} ${dismissed ? "opacity-50" : ""}`}
    >
      <div className="flex items-start">
        {showCheckbox && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect!(); }}
            className="flex-shrink-0 pl-4 pt-4 pr-1 hover:opacity-80 transition-opacity"
            title={selected ? "Deselect issue" : "Select issue for posting"}
          >
            {selected ? (
              <CheckSquare size={18} className="text-primary" />
            ) : (
              <Square size={18} className="text-muted-foreground/50" />
            )}
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-start gap-3 ${showCheckbox ? "pl-2" : "px-5"} pr-5 py-4 hover:bg-secondary/30 transition-colors text-left`}
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
            {dismissed && (
              <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded-md bg-muted border border-border line-through">
                Dismissed
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{issue.title}</p>
          {(issue.file || issue.lineHint) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {issue.file && (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-foreground/80 bg-muted border border-border px-2 py-0.5 rounded-md">
                  <FileCode size={11} className="text-muted-foreground flex-shrink-0" />
                  <span className="max-w-[260px] truncate" title={issue.file}>{issue.file}</span>
                </span>
              )}
              {issue.lineHint && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md">
                  <MapPin size={10} className="flex-shrink-0" />
                  {issue.lineHint}
                </span>
              )}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0 mt-1" />}
      </button>
      </div>

      {expanded && (
        <div className={`border-t px-5 py-5 space-y-5 ${config.border} ${config.bg}`}>
          {/* Location banner — shown prominently at top of expanded section */}
          {(issue.file || issue.lineHint) && (
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-muted/60 border border-border">
              <FileCode size={13} className="text-muted-foreground flex-shrink-0" />
              {issue.file && (
                <code className="text-xs font-mono text-foreground break-all">{issue.file}</code>
              )}
              {issue.lineHint && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                  <MapPin size={10} />
                  {issue.lineHint}
                </span>
              )}
            </div>
          )}
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

          {/* Issue actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const md = buildSingleIssueMarkdown(issue);
                navigator.clipboard.writeText(md);
                setIssueCopied(true);
                toast.success("Issue copied as markdown");
                setTimeout(() => setIssueCopied(false), 2000);
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
            >
              {issueCopied ? <Check size={11} className="text-accent" /> : <ClipboardCopy size={11} />}
              {issueCopied ? "Copied!" : "Copy as MD"}
            </button>
            {dismissed && onRestore && (
              <button
                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
              >
                <Eye size={11} />
                Restore
              </button>
            )}
            {!dismissed && onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10 ml-auto"
              >
                <EyeOff size={11} />
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function CodeReviewPanel({ review, prUrl, prToken, mrData, previousReview, reviewLoading, onTriggerReview }: CodeReviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingSelected, setPostingSelected] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"severity" | "file">("severity");
  const verdictConfig = VERDICT_CONFIG[review.overallVerdict] ?? DEFAULT_VERDICT;
  const VerdictIcon = verdictConfig.icon;

  const criticalCount = review.issues.filter((i) => i.severity === "critical").length;
  const warningCount = review.issues.filter((i) => i.severity === "warning").length;
  const suggestionCount = review.issues.filter((i) => i.severity === "suggestion" || i.severity === "nitpick").length;

  const toggleFilter = (severity: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity); else next.add(severity);
      return next;
    });
  };

  const filteredIssues = activeFilters.size === 0
    ? review.issues.filter((i) => showDismissed || !dismissedIssues.has(i.id))
    : review.issues.filter((i) => activeFilters.has(i.severity) && (showDismissed || !dismissedIssues.has(i.id)));

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  // Group by file
  const issuesByFile = groupBy === "file"
    ? sortedIssues.reduce<Record<string, typeof sortedIssues>>((acc, issue) => {
        const key = issue.file || "General";
        if (!acc[key]) acc[key] = [];
        acc[key].push(issue);
        return acc;
      }, {})
    : null;

  /** Build full GitLab/GitHub-compatible markdown for the review */
  const buildReviewMarkdown = () => {
    const lines: string[] = [];
    const emoji = review.overallScore >= 8 ? '✅' : review.overallScore >= 6 ? '⚠️' : '🚨';

    lines.push(`## ${emoji} Code Review — ${verdictConfig.label} (${review.overallScore}/10)`);
    lines.push(``);
    lines.push(review.executiveSummary);
    lines.push(``);

    // Issues
    if (review.issues.length > 0) {
      lines.push(`### Issues (${review.issues.length})`);
      lines.push(``);

      for (const issue of review.issues) {
        const sevEmoji = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`#### ${sevEmoji} [${issue.severity.toUpperCase()}] ${issue.title}`);
        lines.push(``);
        if (issue.file) {
          lines.push(`📁 \`${issue.file}\`${issue.lineHint ? ` · ${issue.lineHint}` : ''}`);
          lines.push(``);
        }
        if (issue.category) {
          lines.push(`**Category:** ${issue.category}`);
          lines.push(``);
        }
        lines.push(issue.description);
        lines.push(``);

        if (issue.currentCode) {
          lines.push(`**Problematic Code:**`);
          lines.push('```');
          lines.push(issue.currentCode.trim());
          lines.push('```');
          lines.push(``);
        }

        if (issue.suggestedFix) {
          lines.push(`**Suggested Fix:**`);
          lines.push('```');
          lines.push(issue.suggestedFix.trim());
          lines.push('```');
          lines.push(``);
        }

        if (issue.impact) {
          lines.push(`> **Impact:** ${issue.impact}`);
          lines.push(``);
        }

        lines.push(`---`);
        lines.push(``);
      }
    }

    // Strengths
    if (review.strengths.length > 0) {
      lines.push(`### ✨ Strengths`);
      lines.push(``);
      for (const s of review.strengths) {
        lines.push(`- ${s}`);
      }
      lines.push(``);
    }

    // Architecture
    if (review.architectureObservations.length > 0) {
      lines.push(`### 🏛️ Architecture Observations`);
      lines.push(``);
      for (const obs of review.architectureObservations) {
        lines.push(`**${obs.aspect}:** ${obs.observation}`);
        lines.push(`→ *${obs.recommendation}*`);
        lines.push(``);
      }
    }

    // Security
    if (review.securityConsiderations.length > 0) {
      lines.push(`### 🔒 Security`);
      lines.push(``);
      for (const s of review.securityConsiderations) {
        lines.push(`- ${s}`);
      }
      lines.push(``);
    }

    // Performance
    if (review.performanceConsiderations.length > 0) {
      lines.push(`### ⚡ Performance`);
      lines.push(``);
      for (const p of review.performanceConsiderations) {
        lines.push(`- ${p}`);
      }
      lines.push(``);
    }

    // Testing + Merge readiness
    lines.push(`### 🧪 Testing Assessment`);
    lines.push(``);
    lines.push(review.testingAssessment);
    lines.push(``);
    lines.push(`### 🚀 Merge Readiness`);
    lines.push(``);
    lines.push(review.mergeReadiness);
    lines.push(``);
    lines.push(`---`);
    lines.push(`*Generated by AI Code Reviewer*`);

    return lines.join('\n');
  };

  const copyReview = () => {
    const text = buildReviewMarkdown();
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Review markdown copied — paste directly into GitLab/GitHub");
    setTimeout(() => setCopied(false), 2500);
  };

  // ─── Selection helpers ──────────────────────────────────────────────
  const toggleIssueSelection = (id: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIssues(new Set(filteredIssues.map((i) => i.id)));
  };

  const deselectAll = () => {
    setSelectedIssues(new Set());
  };

  const selectedCount = selectedIssues.size;
  const allVisibleSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selectedIssues.has(i.id));

  // ─── Dismiss helpers ──────────────────────────────────────────────
  const dismissIssue = (id: string) => {
    setDismissedIssues((prev) => new Set(prev).add(id));
    setSelectedIssues((prev) => { const next = new Set(prev); next.delete(id); return next; });
    toast.success("Issue dismissed");
  };

  const restoreIssue = (id: string) => {
    setDismissedIssues((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const dismissedCount = dismissedIssues.size;

  const handlePostSelected = async () => {
    if (!prUrl || !prToken || selectedCount === 0) return;
    const selectedList = review.issues.filter((i) => selectedIssues.has(i.id));
    if (!confirm(`Post ${selectedList.length} issue${selectedList.length !== 1 ? "s" : ""} as comments on the ${mrData?.platform === "gitlab" ? "MR" : "PR"}?`)) return;

    setPostingSelected(true);
    try {
      const result = await postInlineComments({
        url: prUrl,
        token: prToken,
        issues: selectedList,
        diffRefs: mrData?.diffRefs,
      });

      const parts: string[] = [];
      if (result.inline > 0) parts.push(`${result.inline} inline`);
      if (result.general > 0) parts.push(`${result.general} general`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);

      if (result.failed === 0) {
        toast.success(`Posted ${result.total} comment${result.total !== 1 ? "s" : ""}: ${parts.join(", ")}`);
        deselectAll();
      } else {
        toast.error(`${parts.join(", ")}. Errors: ${result.errors.slice(0, 2).join("; ")}`);
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setPostingSelected(false);
    }
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
            <div className="flex items-center gap-2">
              {prUrl && prToken && (
                <button
                  onClick={async () => {
                    if (!confirm("Post this review as a comment on the PR/MR?")) return;
                    setPosting(true);
                    try {
                      const body = buildReviewMarkdown();
                      await postReviewComment({ url: prUrl, token: prToken, body });
                      toast.success("Review posted to PR!");
                    } catch (err: unknown) {
                      toast.error(`Failed to post: ${err instanceof Error ? err.message : "Unknown error"}`);
                    } finally {
                      setPosting(false);
                    }
                  }}
                  disabled={posting}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card disabled:opacity-50"
                >
                  {posting ? (
                    <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                  {posting ? "Posting..." : "Post to PR"}
                </button>
              )}
              <button
                onClick={copyReview}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
              >
                {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy as MD"}
              </button>
              {onTriggerReview && (
                <button
                  onClick={onTriggerReview}
                  disabled={reviewLoading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card disabled:opacity-50"
                >
                  {reviewLoading ? (
                    <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  {reviewLoading ? "Reviewing..." : "Re-run"}
                </button>
              )}
            </div>
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
                {previousReview && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-1 ${
                    review.overallScore > previousReview.overallScore
                      ? "bg-accent/10 text-accent"
                      : review.overallScore < previousReview.overallScore
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {review.overallScore > previousReview.overallScore ? "↑" : review.overallScore < previousReview.overallScore ? "↓" : "="}{" "}
                    prev: {previousReview.overallScore}/10
                  </span>
                )}
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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shield size={16} />
              Issues & Suggestions
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filteredIssues.length}{activeFilters.size > 0 ? `/${review.issues.length}` : ""}</span>
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Selection controls */}
              {prUrl && prToken && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={allVisibleSelected ? deselectAll : selectAllVisible}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg border border-border bg-secondary hover:bg-card"
                  >
                    <ListChecks size={12} />
                    {allVisibleSelected ? "Deselect All" : "Select All"}
                  </button>
                  {selectedCount > 0 && (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {selectedCount} selected
                    </span>
                  )}
                </div>
              )}
              {/* Severity filters */}
              <div className="flex gap-1">
                {[
                  { key: "critical", label: "Critical", count: criticalCount, color: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20" },
                  { key: "warning", label: "Warning", count: warningCount, color: "bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20" },
                  { key: "suggestion", label: "Suggestion", count: suggestionCount, color: "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20" },
                ].filter((f) => f.count > 0).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => toggleFilter(f.key)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all font-medium ${
                      activeFilters.has(f.key)
                        ? `${f.color} ring-1 ring-current/20`
                        : activeFilters.size > 0
                        ? "bg-muted/30 text-muted-foreground/50 border-border"
                        : `${f.color}`
                    }`}
                  >
                    {f.label}
                    <span className="font-bold">{f.count}</span>
                  </button>
                ))}
                {activeFilters.size > 0 && (
                  <button
                    onClick={() => setActiveFilters(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {/* Group toggle */}
              <div className="flex border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setGroupBy("severity")}
                  className={`text-xs px-2 py-1 transition-colors ${groupBy === "severity" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Severity
                </button>
                <button
                  onClick={() => setGroupBy("file")}
                  className={`text-xs px-2 py-1 transition-colors ${groupBy === "file" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  File
                </button>
              </div>
              {/* Dismissed toggle */}
              {dismissedCount > 0 && (
                <button
                  onClick={() => setShowDismissed(!showDismissed)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all font-medium ${
                    showDismissed
                      ? "bg-muted text-foreground border-border"
                      : "bg-muted/30 text-muted-foreground border-border"
                  }`}
                >
                  {showDismissed ? <Eye size={11} /> : <EyeOff size={11} />}
                  {dismissedCount} dismissed
                </button>
              )}
            </div>
          </div>

          {groupBy === "severity" ? (
            <div className="space-y-3">
              {sortedIssues.map((issue, i) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  index={i}
                  selected={selectedIssues.has(issue.id)}
                  onToggleSelect={prUrl && prToken ? () => toggleIssueSelection(issue.id) : undefined}
                  dismissed={dismissedIssues.has(issue.id)}
                  onDismiss={() => dismissIssue(issue.id)}
                  onRestore={() => restoreIssue(issue.id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(issuesByFile!).sort(([, a], [, b]) => {
                const critA = a.filter((i) => i.severity === "critical").length;
                const critB = b.filter((i) => i.severity === "critical").length;
                return critB - critA;
              }).map(([file, issues]) => (
                <div key={file}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono font-medium text-foreground bg-muted px-2 py-0.5 rounded-md">
                      {file}
                    </span>
                    <span className="text-xs text-muted-foreground">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-3">
                    {issues.map((issue, i) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        index={i}
                        selected={selectedIssues.has(issue.id)}
                        onToggleSelect={prUrl && prToken ? () => toggleIssueSelection(issue.id) : undefined}
                        dismissed={dismissedIssues.has(issue.id)}
                        onDismiss={() => dismissIssue(issue.id)}
                        onRestore={() => restoreIssue(issue.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Post Selected floating bar */}
          {selectedCount > 0 && prUrl && prToken && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky bottom-4 mt-4 flex items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-primary/20 shadow-lg"
            >
              <div className="flex items-center gap-2 text-sm">
                <ListChecks size={16} className="text-primary" />
                <span className="font-medium text-foreground">{selectedCount} issue{selectedCount !== 1 ? "s" : ""} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={deselectAll}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handlePostSelected}
                  disabled={postingSelected}
                  className="flex items-center gap-1.5 text-xs font-semibold text-background bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                  {postingSelected ? (
                    <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  {postingSelected ? "Posting..." : `Post ${selectedCount} to ${mrData?.platform === "gitlab" ? "MR" : "PR"}`}
                </button>
              </div>
            </motion.div>
          )}
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
