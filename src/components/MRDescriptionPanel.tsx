import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, CheckCircle2, AlertTriangle, Copy, Check,
  ChevronDown, ChevronUp, Lightbulb, ClipboardCopy, Star
} from "lucide-react";
import toast from "react-hot-toast";
import type { MRDescriptionReview } from "../types";

interface MRDescriptionPanelProps {
  review: MRDescriptionReview;
  currentDescription?: string;
}

const QUALITY_CONFIG = {
  excellent: { label: "Excellent", color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  good: { label: "Good", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20" },
  needs_improvement: { label: "Needs Improvement", color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20" },
  poor: { label: "Poor", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
};

const PRIORITY_CONFIG = {
  high: { badge: "bg-destructive text-background", label: "High" },
  medium: { badge: "bg-yellow-500 text-background", label: "Medium" },
  low: { badge: "bg-blue-500 text-background", label: "Low" },
};

export function MRDescriptionPanel({ review, currentDescription }: MRDescriptionPanelProps) {
  const [showSuggested, setShowSuggested] = useState(false);
  const [copiedSuggested, setCopiedSuggested] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const quality = QUALITY_CONFIG[review.currentQuality] ?? QUALITY_CONFIG.needs_improvement;
  const pct = review.qualityScore;
  const highCount = review.suggestions.filter((s) => s.priority === "high").length;
  const medCount = review.suggestions.filter((s) => s.priority === "medium").length;
  const lowCount = review.suggestions.filter((s) => s.priority === "low").length;

  const copySuggestedDesc = () => {
    navigator.clipboard.writeText(review.suggestedDescription);
    setCopiedSuggested(true);
    toast.success("Suggested description copied — paste into your MR");
    setTimeout(() => setCopiedSuggested(false), 2000);
  };

  const copyFullReport = () => {
    const lines: string[] = [];
    lines.push(`## MR Description Review — ${quality.label} (${pct}%)`);
    lines.push("");
    if (review.strengths.length) {
      lines.push("### Strengths");
      review.strengths.forEach((s) => lines.push(`- ${s}`));
      lines.push("");
    }
    if (review.suggestions.length) {
      lines.push("### Suggestions");
      review.suggestions.forEach((s) => lines.push(`- **[${s.priority.toUpperCase()}]** ${s.suggestion}`));
      lines.push("");
    }
    lines.push("### Suggested Description");
    lines.push(review.suggestedDescription);
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedFull(true);
    toast.success("Full report copied as markdown");
    setTimeout(() => setCopiedFull(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Quality card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">MR Description Quality</p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${quality.bg} ${quality.color}`}>
              <FileText size={16} />
              {quality.label}
            </div>
          </div>
          <button
            onClick={copyFullReport}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
          >
            {copiedFull ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
            {copiedFull ? "Copied!" : "Copy as MD"}
          </button>
        </div>

        {/* Score */}
        <div className="flex items-center gap-5 mb-5">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
              <motion.circle
                cx="40" cy="40" r="34" fill="none"
                stroke={pct >= 80 ? "hsl(var(--accent))" : pct >= 60 ? "hsl(38 92% 50%)" : "hsl(var(--destructive))"}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 213.6} 213.6`}
                initial={{ strokeDasharray: "0 213.6" }}
                animate={{ strokeDasharray: `${(pct / 100) * 213.6} 213.6` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{pct}</span>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <Star size={14} />
              Description Quality Score
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {review.suggestions.length === 0
                ? "Your MR description looks great!"
                : `${review.suggestions.length} suggestion${review.suggestions.length !== 1 ? "s" : ""} to improve your description.`}
            </p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex gap-2.5 flex-wrap">
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertTriangle size={13} className="text-destructive" />
              <span className="text-xs font-semibold text-destructive">{highCount} High priority</span>
            </div>
          )}
          {medCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20">
              <Lightbulb size={13} className="text-yellow-500" />
              <span className="text-xs font-semibold text-yellow-500">{medCount} Medium</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20">
              <Lightbulb size={13} className="text-blue-500" />
              <span className="text-xs font-semibold text-blue-500">{lowCount} Low</span>
            </div>
          )}
        </div>
      </div>

      {/* Current description */}
      {currentDescription !== undefined && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText size={14} />
            Current MR Description
          </h3>
          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            {currentDescription ? (
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">{currentDescription}</pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided</p>
            )}
          </div>
        </div>
      )}

      {/* Strengths */}
      {review.strengths.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-accent" />
            Strengths
          </h3>
          <div className="space-y-2">
            {review.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 size={11} className="text-accent" />
                </div>
                <p className="text-sm text-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions list */}
      {review.suggestions.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Lightbulb size={16} className="text-yellow-500" />
            Suggestions ({review.suggestions.length})
          </h3>
          <div className="space-y-2">
            {review.suggestions.map((sug, i) => {
              const prio = PRIORITY_CONFIG[sug.priority] ?? PRIORITY_CONFIG.medium;
              const isExpanded = expandedIdx === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className={`border rounded-2xl overflow-hidden bg-card border-border ${sug.priority === "high" ? "border-l-4 border-l-destructive" : ""}`}
                >
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
                  >
                    <Lightbulb size={16} className="flex-shrink-0 text-yellow-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${prio.badge}`}>
                          {prio.label.toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-secondary border border-border">
                          {sug.category}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-snug">{sug.suggestion}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />}
                  </button>
                  {isExpanded && sug.example && (
                    <div className="border-t border-border px-5 py-4 bg-secondary/20">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Example</p>
                      <pre className="text-xs font-mono text-foreground bg-background border border-border rounded-xl p-3 whitespace-pre-wrap break-words leading-relaxed">{sug.example}</pre>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggested description */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowSuggested(!showSuggested)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
        >
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ClipboardCopy size={16} className="text-accent" />
            Suggested MR Description
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); copySuggestedDesc(); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
            >
              {copiedSuggested ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
              {copiedSuggested ? "Copied!" : "Copy"}
            </button>
            {showSuggested ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </div>
        </button>
        {showSuggested && (
          <div className="border-t border-border px-6 py-5">
            <pre className="text-sm font-mono text-foreground bg-background border border-border rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed max-h-[500px] overflow-y-auto">
              {review.suggestedDescription}
            </pre>
          </div>
        )}
      </div>
    </motion.div>
  );
}
