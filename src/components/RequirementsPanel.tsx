import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle, ExternalLink,
  ChevronDown, ChevronUp, Copy, Check, ListChecks, Lightbulb, Target
} from "lucide-react";
import toast from "react-hot-toast";
import type { RequirementsCheck } from "../types";

interface RequirementsPanelProps {
  check: RequirementsCheck;
  issueUrl?: string;
}

const STATUS_CONFIG = {
  fulfilled: { icon: CheckCircle2, label: "Fulfilled", color: "text-accent", bg: "bg-accent/10 border-accent/20", badge: "bg-accent text-background" },
  partially_fulfilled: { icon: AlertTriangle, label: "Partial", color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20", badge: "bg-yellow-500 text-background" },
  not_fulfilled: { icon: XCircle, label: "Missing", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", badge: "bg-destructive text-background" },
  not_applicable: { icon: MinusCircle, label: "N/A", color: "text-muted-foreground", bg: "bg-muted/50 border-border", badge: "bg-muted text-muted-foreground" },
};

const COVERAGE_CONFIG = {
  fully_covered: { label: "Fully Covered", color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  mostly_covered: { label: "Mostly Covered", color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20" },
  partially_covered: { label: "Partially Covered", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20" },
  poorly_covered: { label: "Poorly Covered", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
};

export function RequirementsPanel({ check, issueUrl }: RequirementsPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const fulfilled = check.requirements.filter((r) => r.status === "fulfilled").length;
  const partial = check.requirements.filter((r) => r.status === "partially_fulfilled").length;
  const missing = check.requirements.filter((r) => r.status === "not_fulfilled").length;
  const na = check.requirements.filter((r) => r.status === "not_applicable").length;
  const coverage = COVERAGE_CONFIG[check.overallCoverage] ?? COVERAGE_CONFIG.partially_covered;

  const pct = check.coverageScore;
  const barColor = pct >= 80 ? "bg-accent" : pct >= 60 ? "bg-yellow-500" : pct >= 40 ? "bg-orange-500" : "bg-destructive";

  const copyAsMd = () => {
    const lines: string[] = [];
    lines.push(`## Requirements Check — ${check.issueTitle}`);
    lines.push(`\n**Coverage:** ${coverage.label} (${pct}%)\n`);
    for (const r of check.requirements) {
      const icon = r.status === "fulfilled" ? "✅" : r.status === "partially_fulfilled" ? "⚠️" : r.status === "not_fulfilled" ? "❌" : "➖";
      lines.push(`${icon} **${r.requirement}** — ${STATUS_CONFIG[r.status].label}`);
      if (r.evidence) lines.push(`  Evidence: ${r.evidence}`);
      if (r.notes) lines.push(`  Notes: ${r.notes}`);
      lines.push("");
    }
    if (check.missingItems.length) {
      lines.push(`### Missing Items`);
      check.missingItems.forEach((m) => lines.push(`- ${m}`));
      lines.push("");
    }
    if (check.suggestions.length) {
      lines.push(`### Suggestions`);
      check.suggestions.forEach((s) => lines.push(`- ${s}`));
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Requirements check copied as markdown");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Requirements Coverage</p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${coverage.bg} ${coverage.color}`}>
              <Target size={16} />
              {coverage.label}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {issueUrl && (
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
              >
                <ExternalLink size={12} />
                View Issue
              </a>
            )}
            <button
              onClick={copyAsMd}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card"
            >
              {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy as MD"}
            </button>
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3 mb-5">
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
            <p className="text-sm font-semibold text-foreground mb-1">{check.issueTitle}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{check.issueSummary}</p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex gap-2.5 flex-wrap">
          {fulfilled > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20">
              <CheckCircle2 size={13} className="text-accent" />
              <span className="text-xs font-semibold text-accent">{fulfilled} Fulfilled</span>
            </div>
          )}
          {partial > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20">
              <AlertTriangle size={13} className="text-yellow-500" />
              <span className="text-xs font-semibold text-yellow-500">{partial} Partial</span>
            </div>
          )}
          {missing > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <XCircle size={13} className="text-destructive" />
              <span className="text-xs font-semibold text-destructive">{missing} Missing</span>
            </div>
          )}
        </div>
      </div>

      {/* Requirements list */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <ListChecks size={16} />
          Requirements ({check.requirements.length})
        </h3>
        <div className="space-y-2">
          {check.requirements.map((req, i) => {
            const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.not_applicable;
            const Icon = cfg.icon;
            const isExpanded = expandedIdx === i;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className={`border rounded-2xl overflow-hidden bg-card ${cfg.bg.split(" ").filter(c => c.startsWith("border-")).join(" ")} ${
                  req.status === "not_fulfilled" ? "border-l-4 border-l-destructive" : ""
                }`}
              >
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
                >
                  <Icon size={16} className={`flex-shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${cfg.badge}`}>
                        {cfg.label.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug">{req.requirement}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />}
                </button>
                {isExpanded && (
                  <div className={`border-t px-5 py-4 space-y-3 ${cfg.bg}`}>
                    {req.evidence && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
                        <p className="text-sm text-foreground leading-relaxed">{req.evidence}</p>
                      </div>
                    )}
                    {req.notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{req.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Missing items */}
      {check.missingItems.length > 0 && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-destructive mb-3 flex items-center gap-2">
            <XCircle size={16} />
            Missing Items
          </h3>
          <ul className="space-y-2">
            {check.missingItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-destructive mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {check.suggestions.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb size={16} className="text-yellow-500" />
            Suggestions
          </h3>
          <ul className="space-y-2">
            {check.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-yellow-500 mt-0.5">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
