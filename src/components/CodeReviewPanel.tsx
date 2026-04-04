import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Shield, Zap, CheckCircle2, XCircle, AlertTriangle, MessageSquare,
  ChevronDown, ChevronUp, Copy, Check, BookOpen, Lock, Gauge, Send, FileCode, MapPin,
  Square, CheckSquare, ListChecks, EyeOff, Eye, ClipboardCopy, Play, RefreshCw, Key, Pencil,
  Bot, Sparkles, Wand2, GitCompareArrows
} from "lucide-react";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import type { CodeReview, ReviewIssue, MRData, RequirementsCheck, MRDescriptionReview, ReviewChatMessage } from "../types";
import { postReviewComment, postInlineComments, fetchPostedIssueIds, buildIssueMarkdown, type CommentDeliveryNote, type InlinePostResult } from "../lib/github-comment";
import ConfirmModal from "./ConfirmModal";
import type { AIConfig, PostingMode, ReviewMode } from "./AISettings";
import { ReviewModePicker } from "./ReviewModePicker";
import { askReviewQuestion, generateIssueFix } from "../lib/api";
import { buildMergeReadinessGates, getRepoKeyFromUrl } from "../lib/review-utils";
import { clearStoredRepoToken, loadStoredRepoToken, saveStoredRepoToken } from "../lib/token-storage";

interface CodeReviewPanelProps {
  review: CodeReview;
  prUrl?: string;
  prToken?: string;
  mrData?: MRData | null;
  previousReview?: CodeReview | null;
  previousReviewMeta?: {
    source: "history" | "rerun";
    previousCommits: number;
    commitDelta: number;
    timestamp?: number;
  } | null;
  reviewLoading?: boolean;
  onTriggerReview?: (reviewMode?: ReviewMode, options?: { fresh?: boolean }) => void;
  reviewMode?: ReviewMode;
  onReviewModeChange?: (reviewMode: ReviewMode) => void;
  onTokenChange?: (token: string) => void;
  postingMode?: PostingMode;
  selectedIssueId?: string;
  selectedFile?: string;
  onSelectedIssueChange?: (selectedIssueId?: string) => void;
  onSelectedFileChange?: (selectedFile?: string) => void;
  reviewChat?: ReviewChatMessage[];
  onReviewChatChange?: (messages: ReviewChatMessage[]) => void;
  aiConfig?: AIConfig | null;
  requirementsCheck?: RequirementsCheck | null;
  mrDescriptionReview?: MRDescriptionReview | null;
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

type VerdictConfigEntry = { label: string; icon: typeof CheckCircle2; color: string; bg: string; cardBorder: string };
const VERDICT_CONFIG: Record<string, VerdictConfigEntry> = {
  approve: { label: "Approved", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10 border-accent/20", cardBorder: "border-accent/40" },
  approve_with_suggestions: { label: "Approved with suggestions", icon: CheckCircle2, color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20", cardBorder: "border-yellow-300/60 dark:border-yellow-500/30" },
  request_changes: { label: "Changes requested", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", cardBorder: "border-destructive/40" },
  needs_discussion: { label: "Needs discussion", icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20", cardBorder: "border-yellow-300/60 dark:border-yellow-500/30" },
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

function ConfidenceBadge({ confidence }: { confidence: ReviewIssue["confidence"] }) {
  const styles = confidence === "high"
    ? "bg-accent/10 text-accent border-accent/20"
    : confidence === "medium"
    ? "bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20"
    : "bg-muted text-muted-foreground border-border";

  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${styles}`}>
      {confidence.toUpperCase()} CONF
    </span>
  );
}

function VerificationBadge({ status }: { status?: ReviewIssue["verificationStatus"] }) {
  const resolved = status === "verified" ? "verified" : "uncertain";
  const styles = resolved === "verified"
    ? "bg-accent/10 text-accent border-accent/20"
    : "bg-muted text-muted-foreground border-border";

  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${styles}`}>
      {resolved === "verified" ? "VERIFIED" : "PARTIAL"}
    </span>
  );
}

function MergeReadinessPanel({
  review,
  requirementsCheck,
  mrDescriptionReview,
}: {
  review: CodeReview;
  requirementsCheck?: RequirementsCheck | null;
  mrDescriptionReview?: MRDescriptionReview | null;
}) {
  const gates = buildMergeReadinessGates({ review, requirementsCheck, mrDescriptionReview });

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <GitCompareArrows size={14} />
        Merge Readiness Gates
      </h3>
      <div className="space-y-2.5">
        {gates.map((gate) => (
          <div key={gate.label} className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
            <span className={`mt-0.5 inline-flex h-2.5 w-2.5 rounded-full ${
              gate.status === "pass" ? "bg-accent" : gate.status === "warn" ? "bg-yellow-500" : "bg-destructive"
            }`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{gate.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{gate.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Build markdown for a single issue */
function buildSingleIssueMarkdown(issue: ReviewIssue): string {
  return buildIssueMarkdown(issue);
}

function IssueCard({ issue, index, selected, onToggleSelect, dismissed, onDismiss, onRestore, posted, editedComment, onEditComment, onResetComment, highlighted, onFocusIssue, generatedFix, fixLoading, onGenerateFix, forceExpanded }: {
  issue: ReviewIssue;
  index: number;
  selected?: boolean;
  onToggleSelect?: () => void;
  dismissed?: boolean;
  onDismiss?: () => void;
  onRestore?: () => void;
  posted?: boolean;
  editedComment?: string;
  onEditComment?: (markdown: string) => void;
  onResetComment?: () => void;
  highlighted?: boolean;
  onFocusIssue?: () => void;
  generatedFix?: string;
  fixLoading?: boolean;
  onGenerateFix?: () => void;
  forceExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!highlighted);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [issueCopied, setIssueCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const isEdited = editedComment !== undefined;

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  // Extract title from edited markdown (first heading line: "#### emoji [SEV] Title")
  const displayTitle = isEdited
    ? (editedComment.match(/^#{1,4}\s+(?:[🔴🟡🔵]\s*)?(?:\[\w+\]\s*)?(.+)$/m)?.[1]?.trim() ?? issue.title)
    : issue.title;
  const config = SEVERITY_CONFIG[issue.severity] ?? DEFAULT_SEVERITY;
  const Icon = config.icon;
  const showCheckbox = onToggleSelect !== undefined && !dismissed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      data-filename={issue.file}
      data-issue-id={issue.id}
      className={`border rounded-2xl overflow-hidden ${config.border} bg-card ${issue.severity === "critical" && !dismissed ? "border-l-4 border-l-destructive" : ""} ${selected || highlighted ? "ring-2 ring-primary/30" : ""} ${dismissed ? "opacity-50" : ""}`}
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
          onClick={() => {
            setExpanded(!expanded);
            onFocusIssue?.();
          }}
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
            {posted && !dismissed && (
              <span className="text-xs font-medium text-accent px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 flex items-center gap-1">
                <Check size={10} />
                Posted
              </span>
            )}
            {isEdited && !dismissed && (
              <span className="text-xs font-medium text-amber-500 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-1">
                <Pencil size={10} />
                Edited
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{displayTitle}</p>
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
          {/* Confidence + Verification meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <ConfidenceBadge confidence={issue.confidence} />
            <VerificationBadge status={issue.verificationStatus} />
            {(issue.file || issue.lineHint) && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-mono text-foreground/70">
                <FileCode size={11} className="text-muted-foreground flex-shrink-0" />
                {issue.file && <span className="truncate max-w-[260px]">{issue.file}</span>}
                {issue.lineHint && (
                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                    <MapPin size={10} />{issue.lineHint}
                  </span>
                )}
              </span>
            )}
          </div>
          {/* Edited comment preview */}
          {isEdited && !editing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Pencil size={10} />
                  Edited Comment Preview
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetComment?.();
                    toast.success("Comment reset to original");
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw size={10} />
                  Reset to original
                </button>
              </div>
              <div className="relative rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                <pre className="text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed text-foreground">{editedComment}</pre>
              </div>
            </div>
          )}

          {/* Original structured content (hidden when edited, unless editing) */}
          {(!isEdited || editing) && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Issue</p>
                <p className="text-sm text-foreground leading-relaxed">{issue.description}</p>
              </div>

              <div className="bg-secondary/40 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Rationale</p>
                <p className="text-sm text-foreground leading-relaxed">{issue.rationale}</p>
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

              {generatedFix && (
                <CodeBlock code={generatedFix} label="Generated Fix Suggestion" variant="accent" />
              )}

              {issue.evidence && issue.evidence.length > 0 && (
                <div className="rounded-xl border border-border bg-card/70">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEvidenceExpanded((current) => !current);
                    }}
                    aria-expanded={evidenceExpanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors rounded-xl"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {issue.evidence.length} supporting item{issue.evidence.length === 1 ? "" : "s"} available
                      </p>
                    </div>
                    {evidenceExpanded ? (
                      <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {evidenceExpanded && (
                    <div className="border-t border-border px-4 py-4 space-y-3">
                      {issue.evidence.map((evidence, evidenceIndex) => (
                        <div key={`${issue.id}-evidence-${evidenceIndex}`} className="rounded-lg border border-border bg-secondary/40 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground bg-background border border-border px-2 py-0.5 rounded-md">
                              {evidence.type.replace(/_/g, " ")}
                            </span>
                            {evidence.file && (
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {evidence.file}{evidence.lineHint ? ` · ${evidence.lineHint}` : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground mt-2 leading-relaxed">{evidence.summary}</p>
                          {evidence.snippet && (
                            <pre className="mt-3 text-xs font-mono rounded-lg border border-border bg-background p-3 overflow-x-auto whitespace-pre-wrap break-words text-foreground">
                              <code>{evidence.snippet}</code>
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Inline comment editor */}
          {editing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit Comment Markdown</p>
                {isEdited && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResetComment?.();
                      setEditValue(buildSingleIssueMarkdown(issue));
                    }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw size={10} />
                    Reset
                  </button>
                )}
              </div>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full min-h-[140px] text-xs font-mono bg-background border border-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-foreground resize-y leading-relaxed"
                spellCheck={false}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const original = buildSingleIssueMarkdown(issue);
                    if (editValue.trim() !== original.trim()) {
                      onEditComment?.(editValue);
                      toast.success("Comment edited");
                    } else {
                      onResetComment?.();
                    }
                    setEditing(false);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-background bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                >
                  <Check size={11} />
                  Save
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors"
                >
                  Cancel
                </button>
              </div>
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
            {onEditComment && !dismissed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!editing) {
                    setEditValue(editedComment ?? buildSingleIssueMarkdown(issue));
                    setEditing(true);
                  } else {
                    setEditing(false);
                  }
                }}
                className={`flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded-md ${
                  isEdited
                    ? "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Pencil size={11} />
                {editing ? "Close Editor" : isEdited ? "Edit (modified)" : "Edit Comment"}
              </button>
            )}
            {issue.fixable && onGenerateFix && !dismissed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateFix();
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
              >
                {fixLoading ? <RefreshCw size={11} className="animate-spin" /> : <Wand2 size={11} />}
                {fixLoading ? "Generating..." : generatedFix ? "Regenerate Fix" : "Generate Fix"}
              </button>
            )}
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

function EditBeforePostModal({
  issues,
  initialBodies,
  platform,
  onPost,
  onCancel,
  posting,
}: {
  issues: ReviewIssue[];
  initialBodies: Record<string, string>;
  platform: string;
  onPost: (editedBodies: Record<string, string>) => void;
  onCancel: () => void;
  posting: boolean;
}) {
  const [bodies, setBodies] = useState<Record<string, string>>(initialBodies);
  const [expandedId, setExpandedId] = useState<string | null>(issues.length === 1 ? issues[0].id : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !posting) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, posting]);

  const updateBody = (id: string, value: string) => {
    setBodies(prev => ({ ...prev, [id]: value }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !posting) onCancel(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Pencil size={16} />
            Review &amp; Edit Comments
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Review and optionally edit {issues.length} comment{issues.length !== 1 ? "s" : ""} before posting to {platform}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {issues.map((issue) => {
            const config = SEVERITY_CONFIG[issue.severity] ?? DEFAULT_SEVERITY;
            const isExpanded = expandedId === issue.id;
            const isEdited = bodies[issue.id] !== initialBodies[issue.id];

            return (
              <div key={issue.id} className={`border rounded-xl overflow-hidden ${config.border}`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
                >
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${config.badge}`}>
                    {issue.severity.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{issue.title}</span>
                  {isEdited && (
                    <span className="text-xs text-amber-500 font-medium flex-shrink-0">edited</span>
                  )}
                  {isExpanded ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {issue.file && <span className="font-mono">{issue.file}</span>}
                        {issue.lineHint && <span> &middot; {issue.lineHint}</span>}
                      </p>
                      {isEdited && (
                        <button
                          onClick={() => setBodies(prev => ({ ...prev, [issue.id]: initialBodies[issue.id] }))}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <RefreshCw size={10} />
                          Reset
                        </button>
                      )}
                    </div>
                    <textarea
                      value={bodies[issue.id] || ""}
                      onChange={(e) => updateBody(issue.id, e.target.value)}
                      className="w-full min-h-[160px] text-xs font-mono bg-background border border-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-foreground resize-y leading-relaxed"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            onClick={onCancel}
            disabled={posting}
            className="text-xs text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg border border-border transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onPost(bodies)}
            disabled={posting}
            className="flex items-center gap-1.5 text-xs font-semibold text-background bg-primary hover:bg-primary/90 px-5 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            {posting ? (
              <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
            ) : (
              <Send size={13} />
            )}
            {posting ? "Posting..." : `Post ${issues.length} Comment${issues.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CollapsibleInfoSection({
  title,
  itemCount,
  children,
}: {
  title: string;
  itemCount: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-5 rounded-2xl border border-border bg-secondary/30 p-4">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {itemCount} item{itemCount === 1 ? "" : "s"} hidden by default
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {expanded && <div className="mt-3">{children}</div>}
    </div>
  );
}

function AskThisPRPanel({
  reviewChat,
  chatInput,
  setChatInput,
  chatLoading,
  aiConfig,
  onSubmit,
}: {
  reviewChat: ReviewChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatLoading: boolean;
  aiConfig: AIConfig | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [open, setOpen] = useState(reviewChat.length > 0);

  useEffect(() => {
    if (reviewChat.length > 0) setOpen(true);
  }, [reviewChat.length]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Ask This PR</span>
          {reviewChat.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{reviewChat.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{open ? "Collapse" : "Ask follow-up questions"}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-5">
          <div className="space-y-3 mb-4">
            {reviewChat.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask focused follow-up questions about the changed code, review findings, or risky files.
              </p>
            )}
            {reviewChat.map((message, index) => (
              <div
                key={`${message.createdAt}-${index}`}
                className={`rounded-2xl border px-4 py-3 ${
                  message.role === "assistant"
                    ? "bg-secondary/40 border-border"
                    : "bg-card border-accent/20"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {message.role === "assistant" ? "AI reviewer" : "You"}
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-end gap-3">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about auth risk, risky files, missing tests, or a specific issue."
              rows={3}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim() || !aiConfig}
              className="flex items-center gap-2 rounded-xl bg-foreground text-background px-4 py-3 text-sm font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {chatLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function PositivesCard({
  strengths,
  architectureObservations,
  securityConsiderations,
  performanceConsiderations,
}: {
  strengths: string[];
  architectureObservations: CodeReview["architectureObservations"];
  securityConsiderations: string[];
  performanceConsiderations: string[];
}) {
  const [open, setOpen] = useState(false);
  const itemCount = strengths.length + architectureObservations.length + securityConsiderations.length + performanceConsiderations.length;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-accent" />
          <span className="text-sm font-semibold text-foreground">Strengths &amp; Observations</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{itemCount}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{open ? "Collapse" : "Expand"}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-5 space-y-5">
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Strengths</p>
              <div className="space-y-2">
                {strengths.map((strength) => (
                  <div key={strength} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 size={11} className="text-accent" />
                    </div>
                    <p className="text-sm text-foreground">{strength}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {architectureObservations.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Architecture Observations</p>
              <div className="space-y-3">
                {architectureObservations.map((obs, i) => (
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
            {securityConsiderations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Lock size={11} />Security
                </p>
                <ul className="space-y-2">
                  {securityConsiderations.map((s) => (
                    <li key={s} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Shield size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {performanceConsiderations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Gauge size={11} />Performance
                </p>
                <ul className="space-y-2">
                  {performanceConsiderations.map((p) => (
                    <li key={p} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Zap size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewInsightsCard({  review,
  previousReview,
  previousReviewMeta,
  onSelectedFileChange,
}: {
  review: CodeReview;
  previousReview: CodeReview | null;
  previousReviewMeta: { source: "history" | "rerun"; previousCommits: number; commitDelta: number; timestamp?: number } | null;
  onSelectedFileChange?: (file: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const itemCount = [
    review.reviewDiff && previousReview ? 1 : 0,
    review.testGapSummary ? 1 : 0,
    review.verificationSummary ? 1 : 0,
    review.contextInsights?.length ?? 0,
    review.riskHotspots.length,
    review.reviewerSuggestions?.length ?? 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Review Insights</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{itemCount}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{open ? "Hide" : "Show"} context, risks &amp; diff</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-5 space-y-4">
          {review.reviewDiff && previousReview && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <GitCompareArrows size={14} />
                {previousReviewMeta?.source === "history" ? "Comparison vs Last Saved Review" : "Re-run Comparison"}
              </h3>
              {previousReviewMeta && (
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  {previousReviewMeta.source === "history"
                    ? previousReviewMeta.commitDelta > 0
                      ? `${previousReviewMeta.commitDelta} new commit${previousReviewMeta.commitDelta === 1 ? "" : "s"} detected since the last saved review${previousReviewMeta.timestamp ? ` from ${formatDistanceToNow(previousReviewMeta.timestamp, { addSuffix: true })}` : ""}.`
                      : `Comparing against the last saved review${previousReviewMeta.timestamp ? ` from ${formatDistanceToNow(previousReviewMeta.timestamp, { addSuffix: true })}` : ""}. No new commits were detected.`
                    : "Comparing this review against the previous run on the currently loaded MR snapshot."}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-accent/10 text-accent px-2.5 py-1 border border-accent/20">
                  {review.reviewDiff.scoreDelta >= 0 ? "+" : ""}{review.reviewDiff.scoreDelta} score delta
                </span>
                <span className="rounded-full bg-blue-50 text-blue-600 px-2.5 py-1 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                  {review.reviewDiff.addedIssueIds.length} added
                </span>
                <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1 border border-border">
                  {review.reviewDiff.removedIssueIds.length} removed
                </span>
                <span className="rounded-full bg-yellow-50 text-yellow-600 px-2.5 py-1 border border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20">
                  {review.reviewDiff.changedSeverityIds.length} severity changes
                </span>
              </div>
            </div>
          )}

          {review.testGapSummary && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Test Gap Signal</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{review.testGapSummary}</p>
            </div>
          )}

          {review.verificationSummary && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Verification Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{review.verificationSummary}</p>
            </div>
          )}

          {review.contextInsights && review.contextInsights.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Related Context Retrieved</p>
              <div className="space-y-2">
                {review.contextInsights.map((insight) => (
                  <button
                    key={`${insight.file}-${insight.source}-${insight.reason}`}
                    onClick={() => onSelectedFileChange?.(insight.file)}
                    className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-mono text-foreground truncate">{insight.file}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {insight.source.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.reason}</p>
                    {insight.excerpt && (
                      <pre className="mt-2 text-xs font-mono rounded-lg border border-border bg-background p-3 overflow-x-auto whitespace-pre-wrap break-words text-foreground">
                        <code>{insight.excerpt}</code>
                      </pre>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {review.riskHotspots.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Risk Hotspots</p>
              <div className="space-y-2">
                {review.riskHotspots.map((hotspot) => (
                  <button
                    key={hotspot.file}
                    onClick={() => onSelectedFileChange?.(hotspot.file)}
                    className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-mono text-foreground truncate">{hotspot.file}</span>
                      <span className="text-xs font-semibold text-destructive">Risk {hotspot.score}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{hotspot.reasons.join(" · ")}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {review.reviewerSuggestions && review.reviewerSuggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Suggested Reviewers</p>
              <div className="space-y-2">
                {review.reviewerSuggestions.map((suggestion) => (
                  <div key={suggestion.reviewer} className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">{suggestion.reviewer}</span>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.files.length} owned file{suggestion.files.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-words">{suggestion.files.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CodeReviewPanel({
  review,
  prUrl,
  prToken,
  mrData,
  previousReview,
  previousReviewMeta,
  reviewLoading,
  onTriggerReview,
  reviewMode = "deep",
  onReviewModeChange,
  onTokenChange,
  postingMode = "inline",
  selectedIssueId,
  selectedFile,
  onSelectedIssueChange,
  onSelectedFileChange,
  reviewChat = [],
  onReviewChatChange,
  aiConfig,
  requirementsCheck,
  mrDescriptionReview,
}: CodeReviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingSelected, setPostingSelected] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState<CommentDeliveryNote[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [localToken, setLocalToken] = useState("");
  const [rememberToken, setRememberToken] = useState(false);
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const repoKey = getRepoKeyFromUrl(prUrl ?? "");
  const effectiveToken = prToken || localToken || "";
  const hasToken = !!effectiveToken;
  const canPost = !!prUrl && hasToken;
  const [postedIssues, setPostedIssues] = useState<Set<string>>(new Set());

  // Detect issues already posted on the MR/PR
  useEffect(() => {
    if (!prUrl || !effectiveToken || review.issues.length === 0) return;
    let cancelled = false;
    fetchPostedIssueIds({ url: prUrl, token: effectiveToken, issues: review.issues }).then((ids) => {
      if (!cancelled && ids.size > 0) setPostedIssues((prev) => {
        const merged = new Set(prev);
        ids.forEach((id) => merged.add(id));
        return merged;
      });
    });
    return () => { cancelled = true; };
  }, [prUrl, effectiveToken, review.issues]);

  useEffect(() => {
    if (!repoKey || prToken) return;
    const storedToken = loadStoredRepoToken(repoKey);
    if (storedToken?.token) {
      setLocalToken(storedToken.token);
      setRememberToken(storedToken.persistence === "persistent");
      setHasSavedToken(true);
      return;
    }

    setHasSavedToken(false);
  }, [repoKey, prToken]);
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});
  const [editModal, setEditModal] = useState<{ issues: ReviewIssue[]; bodies: Record<string, string> } | null>(null);
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"severity" | "file">("severity");
  const [generatedFixes, setGeneratedFixes] = useState<Record<string, string>>({});
  const [loadingFixId, setLoadingFixId] = useState<string | null>(null);
  const [expandCriticalsFlag, setExpandCriticalsFlag] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const hasRepoContext = !!aiConfig?.repoMemory?.trim();
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
        lines.push(issue.description);
        lines.push(``);
        lines.push(`**Rationale:** ${issue.rationale}`);
        lines.push(``);

        if (issue.evidence && issue.evidence.length > 0) {
          lines.push(`**Evidence:**`);
          for (const evidence of issue.evidence) {
            lines.push(`- [${evidence.type}] ${evidence.summary}${evidence.file ? ` (${evidence.file}${evidence.lineHint ? ` · ${evidence.lineHint}` : ""})` : ""}`);
            if (evidence.snippet) {
              lines.push('```');
              lines.push(evidence.snippet);
              lines.push('```');
            }
          }
          lines.push(``);
        }

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

    if (review.verificationSummary) {
      lines.push(`### ✅ Verification Summary`);
      lines.push(``);
      lines.push(review.verificationSummary);
      lines.push(``);
    }

    if (review.contextInsights && review.contextInsights.length > 0) {
      lines.push(`### 🧭 Related Context Insights`);
      lines.push(``);
      for (const insight of review.contextInsights) {
        lines.push(`- **${insight.file}** [${insight.source}] — ${insight.reason}`);
        if (insight.excerpt) {
          lines.push('```');
          lines.push(insight.excerpt);
          lines.push('```');
        }
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
    lines.push(`### 🧪 Test Gap Summary`);
    lines.push(``);
    lines.push(review.testGapSummary);
    lines.push(``);
    if (review.riskHotspots.length > 0) {
      lines.push(`### 🔥 Risk Hotspots`);
      lines.push(``);
      for (const hotspot of review.riskHotspots) {
        lines.push(`- **${hotspot.file}** (${hotspot.score}) — ${hotspot.reasons.join("; ")}`);
      }
      lines.push(``);
    }
    if (review.reviewerSuggestions && review.reviewerSuggestions.length > 0) {
      lines.push(`### 👥 Reviewer Routing`);
      lines.push(``);
      for (const suggestion of review.reviewerSuggestions) {
        lines.push(`- **${suggestion.reviewer}** — ${suggestion.files.join(", ")}`);
      }
      lines.push(``);
    }
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

  useEffect(() => {
    if (!selectedIssueId) return;
    const el = document.querySelector(`[data-issue-id="${CSS.escape(selectedIssueId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedIssueId, filteredIssues.length, groupBy]);

  const doPostSelected = async (editedBodies?: Record<string, string>) => {
    if (!prUrl || !effectiveToken || selectedCount === 0) return;
    const selectedList = review.issues.filter((i) => selectedIssues.has(i.id));
    setPostingSelected(true);
    setDeliveryNotes([]);
    try {
      const result = await postInlineComments({
        url: prUrl,
        token: effectiveToken,
        issues: selectedList,
        diffRefs: mrData?.diffRefs,
        overrideBodies: editedBodies,
        mode: postingMode,
      });

      if (result.postedIds.length > 0) {
        setPostedIssues((prev) => {
          const next = new Set(prev);
          result.postedIds.forEach((id) => next.add(id));
          return next;
        });
      }

      setDeliveryNotes(result.deliveryNotes);

      const parts: string[] = [];
      if (result.inline > 0) parts.push(`${result.inline} inline`);
      if (result.general > 0) parts.push(`${result.general} general`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);

      if (result.failed === 0) {
        toast.success(`Posted ${result.total} comment${result.total !== 1 ? "s" : ""}: ${parts.join(", ")}`);
        if (result.deliveryNotes.length > 0) {
          const platform = mrData?.platform === "gitlab" ? "MR" : "PR";
          const detail = result.deliveryNotes.length === 1
            ? result.deliveryNotes[0].reason
            : `${result.deliveryNotes.length} comments were posted as general ${platform} notes. Delivery details are shown above the issue list.`;
          toast(detail, { duration: 5000 });
        }
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

  const handlePostSelected = () => {
    if (!prUrl || !effectiveToken || selectedCount === 0) return;
    const selectedList = review.issues.filter((i) => selectedIssues.has(i.id));
    const bodies: Record<string, string> = {};
    for (const issue of selectedList) {
      bodies[issue.id] = editedComments[issue.id] ?? buildIssueMarkdown(issue);
    }
    setEditModal({ issues: selectedList, bodies });
  };

  const handleGenerateFix = async (issue: ReviewIssue) => {
    if (!mrData || !aiConfig) {
      toast.error("AI settings are required to generate a fix");
      return;
    }

    setLoadingFixId(issue.id);
    try {
      const generatedFix = await generateIssueFix(mrData, issue, aiConfig, effectiveToken || undefined);
      setGeneratedFixes((prev) => ({ ...prev, [issue.id]: generatedFix }));
      toast.success("Generated a concrete fix suggestion");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate fix");
    } finally {
      setLoadingFixId(null);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || !mrData || !aiConfig) return;

    const nextMessages: ReviewChatMessage[] = [
      ...reviewChat,
      { role: "user", content: question, createdAt: Date.now() },
    ];
    onReviewChatChange?.(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await askReviewQuestion(mrData, aiConfig, question, effectiveToken || undefined);
      onReviewChatChange?.([
        ...nextMessages,
        { role: "assistant", content: response, createdAt: Date.now() },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ask review question");
    } finally {
      setChatLoading(false);
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
      <div className={`bg-card border-2 rounded-2xl overflow-hidden ${verdictConfig.cardBorder}`}>
        {/* Header strip */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Code Review Summary</p>
          <div className="flex items-center gap-2">
            {canPost && (
              <button
                onClick={() => {
                  const platform = mrData?.platform === "gitlab" ? "MR" : "PR";
                  setConfirmModal({
                    title: `Post Review to ${platform}`,
                    message: `This will post the full code review as a comment on the ${platform}. This action cannot be undone.`,
                    confirmLabel: `Post to ${platform}`,
                    onConfirm: async () => {
                      setConfirmModal(null);
                      setPosting(true);
                      try {
                        const body = buildReviewMarkdown();
                        await postReviewComment({ url: prUrl!, token: effectiveToken, body });
                        toast.success("Review posted to PR!");
                      } catch (err: unknown) {
                        toast.error(`Failed to post: ${err instanceof Error ? err.message : "Unknown error"}`);
                      } finally {
                        setPosting(false);
                      }
                    },
                  });
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
          </div>
        </div>

        {/* Score + verdict row */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Code Quality Score</span>
              {/* Progress bar */}
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: review.overallScore >= 8
                      ? "hsl(var(--accent))"
                      : review.overallScore >= 6
                      ? "hsl(38 92% 50%)"
                      : "hsl(var(--destructive))",
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: `${(review.overallScore / 10) * 100}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                {review.overallScore}/10
                {previousReview && (
                  <span className={`text-xs font-medium ml-2 ${
                    review.overallScore > previousReview.overallScore
                      ? "text-accent"
                      : review.overallScore < previousReview.overallScore
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}>
                    {review.overallScore > previousReview.overallScore ? "↑" : review.overallScore < previousReview.overallScore ? "↓" : "="}
                    {" "}{previousReview.overallScore}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Verdict pill */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl border text-sm font-bold ${verdictConfig.bg} ${verdictConfig.color}`}>
              <VerdictIcon size={15} />
              {verdictConfig.label}
            </div>
            {hasRepoContext && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20">
                <BookOpen size={12} className="text-accent" />
                <span className="text-xs font-semibold text-accent">Repo context</span>
              </div>
            )}
          </div>

          {/* Issue stat boxes */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl bg-destructive/8 border border-destructive/15">
              <XCircle size={16} className="text-destructive mb-0.5" />
              <span className="text-2xl font-bold text-destructive tabular-nums leading-none">{criticalCount}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">Critical</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl bg-yellow-500/8 border border-yellow-500/15 dark:bg-yellow-500/8 dark:border-yellow-500/15">
              <AlertTriangle size={16} className="text-yellow-500 mb-0.5" />
              <span className="text-2xl font-bold text-yellow-500 tabular-nums leading-none">{warningCount}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">Warning{warningCount !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl bg-blue-500/8 border border-blue-500/15">
              <MessageSquare size={16} className="text-blue-500 mb-0.5" />
              <span className="text-2xl font-bold text-blue-500 tabular-nums leading-none">{suggestionCount}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">Suggestion{suggestionCount !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Executive summary */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{review.executiveSummary}</p>

          {/* Re-run controls row */}
          {onTriggerReview && (
            <div className="flex items-center gap-2 flex-wrap pt-1 pb-1 border-t border-border/50">
              {onReviewModeChange && (
                <ReviewModePicker
                  value={reviewMode}
                  onChange={onReviewModeChange}
                  disabled={reviewLoading}
                  compact
                />
              )}
              <button
                onClick={() => onTriggerReview(reviewMode)}
                disabled={reviewLoading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card disabled:opacity-50"
              >
                {reviewLoading ? (
                  <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {reviewLoading ? "Reviewing..." : `Re-run ${reviewMode === "quick" ? "Quick" : "Deep"}`}
              </button>
              <button
                onClick={() => onTriggerReview(reviewMode, { fresh: true })}
                disabled={reviewLoading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-50"
                title="Run from scratch without comparing against the previous review"
              >
                {reviewLoading ? (
                  <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                {reviewLoading ? "Reviewing..." : `Fresh ${reviewMode === "quick" ? "Quick" : "Deep"}`}
              </button>
            </div>
          )}
        </div>

        {/* Merge Readiness Gates */}
        <div className="px-5 pb-5 border-t border-border/50 pt-4">
          <MergeReadinessPanel
            review={review}
            requirementsCheck={requirementsCheck}
            mrDescriptionReview={mrDescriptionReview}
          />
        </div>
      </div>

      {/* Secondary insights card — collapsed by default */}
      {(review.reviewDiff || review.testGapSummary || review.verificationSummary ||
        (review.contextInsights && review.contextInsights.length > 0) ||
        review.riskHotspots.length > 0 ||
        (review.reviewerSuggestions && review.reviewerSuggestions.length > 0)) && (
        <ReviewInsightsCard
          review={review}
          previousReview={previousReview ?? null}
          previousReviewMeta={previousReviewMeta ?? null}
          onSelectedFileChange={onSelectedFileChange}
        />
      )}

      {/* Issues */}
      {review.issues.length > 0 && (
        <div>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm -mx-4 px-4 py-3 mb-2 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shield size={16} />
              Issues & Suggestions
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filteredIssues.length}{activeFilters.size > 0 ? `/${review.issues.length}` : ""}</span>
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Expand criticals shortcut */}
              {criticalCount > 0 && (
                <button
                  onClick={() => setExpandCriticalsFlag((n) => n + 1)}
                  className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-colors px-2 py-1 rounded-lg"
                >
                  <XCircle size={11} />
                  Expand {criticalCount} Critical{criticalCount !== 1 ? "s" : ""}
                </button>
              )}
              {/* Selection controls */}
              {prUrl && (
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

          {deliveryNotes.length > 0 && (
            <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/20 dark:bg-yellow-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                    Comment Delivery Details
                  </h4>
                  <p className="mt-1 text-xs text-yellow-700/90 dark:text-yellow-200/80">
                    These comments were posted as general {mrData?.platform === "gitlab" ? "MR" : "PR"} notes instead of inline comments.
                  </p>
                </div>
                <button
                  onClick={() => setDeliveryNotes([])}
                  className="text-xs text-yellow-700/90 hover:text-yellow-900 dark:text-yellow-200/80 dark:hover:text-yellow-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {deliveryNotes.map((note) => {
                  const matchingIssue = review.issues.find((issue) => issue.id === note.issueId);
                  return (
                    <button
                      key={`${note.issueId}-${note.reason}`}
                      onClick={() => {
                        onSelectedIssueChange?.(note.issueId);
                        if (matchingIssue?.file) onSelectedFileChange?.(matchingIssue.file);
                      }}
                      className="w-full rounded-xl border border-yellow-200 bg-card px-4 py-3 text-left hover:bg-yellow-50/70 transition-colors dark:border-yellow-500/20 dark:bg-card dark:hover:bg-yellow-500/5"
                    >
                      <p className="text-sm font-medium text-foreground">{note.issueTitle}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note.reason}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {groupBy === "severity" ? (
            <div className="space-y-3">
              {sortedIssues.map((issue, i) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  index={i}
                  selected={selectedIssues.has(issue.id)}
                  onToggleSelect={prUrl ? () => toggleIssueSelection(issue.id) : undefined}
                  dismissed={dismissedIssues.has(issue.id)}
                  onDismiss={() => dismissIssue(issue.id)}
                  onRestore={() => restoreIssue(issue.id)}
                  posted={postedIssues.has(issue.id)}
                  editedComment={editedComments[issue.id]}
                  onEditComment={prUrl ? (md) => setEditedComments((prev) => ({ ...prev, [issue.id]: md })) : undefined}
                  onResetComment={() => setEditedComments((prev) => { const next = { ...prev }; delete next[issue.id]; return next; })}
                  highlighted={selectedIssueId === issue.id}
                  onFocusIssue={() => {
                    onSelectedIssueChange?.(issue.id);
                    onSelectedFileChange?.(issue.file);
                  }}
                  generatedFix={generatedFixes[issue.id]}
                  fixLoading={loadingFixId === issue.id}
                  onGenerateFix={issue.fixable ? () => handleGenerateFix(issue) : undefined}
                  forceExpanded={issue.severity === "critical" ? expandCriticalsFlag > 0 : undefined}
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
                        onToggleSelect={prUrl ? () => toggleIssueSelection(issue.id) : undefined}
                        dismissed={dismissedIssues.has(issue.id)}
                        onDismiss={() => dismissIssue(issue.id)}
                        onRestore={() => restoreIssue(issue.id)}
                        posted={postedIssues.has(issue.id)}
                        editedComment={editedComments[issue.id]}
                        onEditComment={prUrl ? (md) => setEditedComments((prev) => ({ ...prev, [issue.id]: md })) : undefined}
                        onResetComment={() => setEditedComments((prev) => { const next = { ...prev }; delete next[issue.id]; return next; })}
                        highlighted={selectedIssueId === issue.id}
                        onFocusIssue={() => {
                          onSelectedIssueChange?.(issue.id);
                          onSelectedFileChange?.(issue.file);
                        }}
                        generatedFix={generatedFixes[issue.id]}
                        fixLoading={loadingFixId === issue.id}
                        onGenerateFix={issue.fixable ? () => handleGenerateFix(issue) : undefined}
                        forceExpanded={issue.severity === "critical" ? expandCriticalsFlag > 0 : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inline token input when URL exists but no token */}
          {prUrl && !hasToken && selectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky bottom-4 mt-4 p-3 rounded-2xl bg-card border border-yellow-300/40 dark:border-yellow-500/20 shadow-lg"
            >
              <div className="flex items-center gap-2 mb-2 text-sm">
                <ListChecks size={16} className="text-primary" />
                <span className="font-medium text-foreground">{selectedCount} issue{selectedCount !== 1 ? "s" : ""} selected</span>
                <span className="text-xs text-muted-foreground">— enter a token to post to the {mrData?.platform === "gitlab" ? "MR" : "PR"}</span>
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (localToken.trim()) {
                    const trimmedToken = localToken.trim();
                    if (repoKey) {
                      saveStoredRepoToken(repoKey, trimmedToken, rememberToken ? "persistent" : "session");
                      setHasSavedToken(true);
                    }
                    onTokenChange?.(trimmedToken);
                    toast.success("Token saved — you can now post comments");
                  }
                }}
              >
                <div className="relative flex-1">
                  <Key size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={localToken}
                    onChange={(e) => setLocalToken(e.target.value)}
                    placeholder={mrData?.platform === "gitlab" ? "glpat-xxxx" : "ghp_xxxx"}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50 text-foreground"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={rememberToken}
                    onChange={(e) => setRememberToken(e.target.checked)}
                    className="rounded border-border bg-background"
                  />
                  <span>Remember</span>
                </label>
                <button
                  type="submit"
                  disabled={!localToken.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-background bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send size={13} />
                  Enable Posting
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors"
                >
                  Clear
                </button>
              </form>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield size={11} />
                  {rememberToken
                    ? "Stored in this browser for this repo until you clear it."
                    : "Stored only for this browser session unless you opt in to remember it."}
                </p>
                {hasSavedToken && repoKey && (
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredRepoToken(repoKey);
                      setLocalToken("");
                      setRememberToken(false);
                      setHasSavedToken(false);
                      onTokenChange?.("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forget saved token
                  </button>
                )}
              </div>
              {mrData?.platform === "gitlab" && (
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

          {/* Post Selected floating bar */}
          {selectedCount > 0 && canPost && (
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

      {/* Strengths + Architecture + Security + Performance — collapsed by default */}
      {(review.strengths.length > 0 || review.architectureObservations.length > 0 ||
        review.securityConsiderations.length > 0 || review.performanceConsiderations.length > 0) && (
        <PositivesCard
          strengths={review.strengths}
          architectureObservations={review.architectureObservations}
          securityConsiderations={review.securityConsiderations}
          performanceConsiderations={review.performanceConsiderations}
        />
      )}

      {/* Testing Assessment + Merge Readiness — always visible */}
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

      <AskThisPRPanel
        reviewChat={reviewChat}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatLoading={chatLoading}
        aiConfig={aiConfig ?? null}
        onSubmit={handleAskQuestion}
      />

      {editModal && (
        <EditBeforePostModal
          issues={editModal.issues}
          initialBodies={editModal.bodies}
          platform={mrData?.platform === "gitlab" ? "MR" : "PR"}
          onPost={(editedBodies) => {
            setEditModal(null);
            doPostSelected(editedBodies);
          }}
          onCancel={() => setEditModal(null)}
          posting={postingSelected}
        />
      )}
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ""}
        message={confirmModal?.message ?? ""}
        confirmLabel={confirmModal?.confirmLabel ?? "Confirm"}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </motion.div>
  );
}
