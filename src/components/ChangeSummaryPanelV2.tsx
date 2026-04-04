import { motion } from "framer-motion";
import { AlertTriangle, Code2, TestTube, Layers, Copy, Check, FileText, CheckCircle2, XCircle } from "lucide-react";
import type { ChangeSummary, MRData } from "../types";
import { DiffViewer, DiffStats } from "./DiffViewer";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { CollapsibleCard } from "./ui/CollapsibleCard";
import { StatusBadge } from "./ui/StatusBadge";
import { CompactList } from "./ui/CompactList";

interface ChangeSummaryPanelProps {
    summary: ChangeSummary;
    mrData: MRData;
    scrollToFile?: string | null;
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
    feature: "bg-accent/10 text-accent border-accent/20",
    bugfix: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    refactor: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    chore: "bg-muted text-muted-foreground border-border",
    docs: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    test: "bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
    perf: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
    security: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    breaking: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
};

export function ChangeSummaryPanelV2({ summary, mrData, scrollToFile }: ChangeSummaryPanelProps) {
    const [showAllDiffs, setShowAllDiffs] = useState(false);
    const [copied, setCopied] = useState(false);

    // Auto-expand all diffs when navigating to a specific file
    useEffect(() => {
        if (scrollToFile && mrData.files.length > 5) {
            const idx = mrData.files.findIndex((f) => f.filename === scrollToFile);
            if (idx >= 5) {
                setShowAllDiffs(true);
            }
        }
    }, [scrollToFile, mrData.files]);

    const displayedFiles = showAllDiffs ? mrData.files : mrData.files.slice(0, 5);

    const copySummary = () => {
        const text = [
            `# Change Summary: ${summary.purpose}`,
            ``,
            `**Type:** ${summary.changeType} | **Scope:** ${summary.scope}`,
            summary.breakingChanges ? `**⚠️ Breaking Changes:** ${summary.breakingChangesDescription}` : "",
            ``,
            `## Summary`,
            summary.summary,
            ``,
            `## Key Changes`,
            ...summary.keyChanges.map((c) => `- **${c.area}** (${c.impact}): ${c.description}`),
            ``,
            `## Technologies`,
            summary.techStack.join(", "),
            ``,
            `## Testing`,
            summary.testingStatus,
            ``,
            `## Stats`,
            `${mrData.pr.changedFiles} files changed, +${mrData.pr.additions}/-${mrData.pr.deletions} lines, ${mrData.pr.commits} commit(s)`,
        ].filter(Boolean).join("\n");
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Summary copied to clipboard");
        setTimeout(() => setCopied(false), 2500);
    };

    // Determine if testing is adequate
    const hasTests = summary.testingStatus.toLowerCase().includes("test") &&
        !summary.testingStatus.toLowerCase().includes("no test") &&
        !summary.testingStatus.toLowerCase().includes("missing");

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
        >
            {/* Compact Overview Card */}
            <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${CHANGE_TYPE_COLORS[summary.changeType] ?? CHANGE_TYPE_COLORS.chore}`}>
                                {summary.changeType}
                            </span>
                            {summary.breakingChanges && (
                                <StatusBadge variant="critical" size="sm" icon={<AlertTriangle size={10} />}>
                                    Breaking
                                </StatusBadge>
                            )}
                            <span className="text-xs text-muted-foreground">
                                {summary.scope}
                            </span>
                        </div>
                        <h2 className="text-base font-bold text-foreground mb-2">{summary.purpose}</h2>

                        {/* Compact stats */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <DiffStats
                                additions={mrData.pr.additions}
                                deletions={mrData.pr.deletions}
                                changedFiles={mrData.pr.changedFiles}
                            />
                            <span>·</span>
                            <span>{mrData.pr.commits} commit{mrData.pr.commits !== 1 ? "s" : ""}</span>
                        </div>
                    </div>
                    <button
                        onClick={copySummary}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-card flex-shrink-0"
                    >
                        {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>

                {/* Collapsible full summary */}
                <CollapsibleCard
                    title="Full Description"
                    icon={<FileText size={14} />}
                    defaultExpanded={true}
                    className="mt-3"
                    headerClassName="py-2 px-3 bg-secondary/30"
                    contentClassName="py-3"
                >
                    <p className="text-sm text-muted-foreground leading-relaxed">{summary.summary}</p>
                </CollapsibleCard>

                {summary.breakingChanges && summary.breakingChangesDescription && (
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/20 bg-destructive/5 mt-3">
                        <AlertTriangle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-destructive">Breaking Changes</p>
                            <p className="text-sm text-foreground mt-0.5">{summary.breakingChangesDescription}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Key Changes - Collapsible with compact preview */}
            <CollapsibleCard
                title={`Key Changes (${summary.keyChanges.length} areas)`}
                icon={<Layers size={15} />}
                badge={
                    <StatusBadge variant="info" size="sm">
                        {summary.keyChanges.filter(c => c.impact === "high").length} high impact
                    </StatusBadge>
                }
                defaultExpanded={summary.keyChanges.length <= 3}
            >
                <div className="space-y-2">
                    {summary.keyChanges.map((change) => (
                        <div
                            key={change.area}
                            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-foreground">{change.area}</span>
                                    <StatusBadge
                                        variant={change.impact === "high" ? "critical" : change.impact === "medium" ? "warning" : "success"}
                                        size="sm"
                                    >
                                        {change.impact.toUpperCase()}
                                    </StatusBadge>
                                </div>
                                <p className="text-sm text-muted-foreground">{change.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </CollapsibleCard>

            {/* Tech Stack & Testing - Side by side, compact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CollapsibleCard
                    title="Tech Stack"
                    icon={<Code2 size={14} />}
                    badge={<span className="text-xs text-muted-foreground">{summary.techStack.length} items</span>}
                    defaultExpanded={false}
                    headerClassName="py-2.5"
                >
                    <div className="flex flex-wrap gap-2">
                        {summary.techStack.map((tech) => (
                            <span key={tech} className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border text-foreground font-medium">
                                {tech}
                            </span>
                        ))}
                    </div>
                </CollapsibleCard>

                <CollapsibleCard
                    title="Testing Coverage"
                    icon={<TestTube size={14} />}
                    badge={
                        hasTests ? (
                            <StatusBadge variant="success" size="sm" icon={<CheckCircle2 size={10} />}>
                                Tests Added
                            </StatusBadge>
                        ) : (
                            <StatusBadge variant="warning" size="sm" icon={<XCircle size={10} />}>
                                No Tests
                            </StatusBadge>
                        )
                    }
                    defaultExpanded={!hasTests}
                    headerClassName="py-2.5"
                >
                    <p className="text-sm text-muted-foreground leading-relaxed">{summary.testingStatus}</p>
                </CollapsibleCard>
            </div>

            {/* File Diffs - Expanded by default */}
            <CollapsibleCard
                title={`Changed Files (${mrData.files.length})`}
                icon={<FileText size={15} />}
                badge={
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-accent">+{mrData.pr.additions}</span>
                        <span className="text-xs text-destructive">-{mrData.pr.deletions}</span>
                    </div>
                }
                defaultExpanded={true}
            >
                <CompactList
                    items={mrData.files.map((file) => (
                        <DiffViewer key={file.filename} file={file} defaultOpen={false} />
                    ))}
                    initialVisible={5}
                    showMoreText={`Show ${mrData.files.length - 5} more files`}
                />
            </CollapsibleCard>
        </motion.div>
    );
}
