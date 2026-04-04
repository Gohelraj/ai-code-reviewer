import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
  FileText, GitBranch, Search, ListChecks, FileEdit as FileEditIcon,
  FolderTree, Download, Printer, StickyNote, ClipboardCopy, Braces, Clock,
  PanelLeftClose, PanelLeft,
  ChevronRight, ChevronDown, Plus, Minus, Play,
  XCircle, AlertTriangle, MessageSquare,
  FilePlus, FileX, FileSymlink
} from "lucide-react";
import type { AnalysisState, FileDiff } from "../types";

/* ───── Navigation items ───── */
interface NavItem {
  id: AnalysisState["activeTab"];
  label: string;
  icon: typeof FileText;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "summary",        label: "Summary",        icon: FileText,     shortcut: "1" },
  { id: "flow",           label: "Exec Flow",      icon: GitBranch,    shortcut: "2" },
  { id: "review",         label: "Code Review",    icon: Search,       shortcut: "3" },
  { id: "requirements",   label: "Requirements",   icon: ListChecks,   shortcut: "4" },
  { id: "mr-description", label: "MR Description", icon: FileEditIcon, shortcut: "5" },
];

const FILE_STATUS: Record<string, { icon: typeof FileText; color: string }> = {
  added:    { icon: FilePlus,    color: "text-accent" },
  modified: { icon: FileEditIcon, color: "text-yellow-500" },
  removed:  { icon: FileX,       color: "text-destructive" },
  renamed:  { icon: FileSymlink,  color: "text-blue-500" },
};

/* ───── Props ───── */
interface NavigationSidebarProps {
  activeTab: AnalysisState["activeTab"];
  onTabChange: (tab: AnalysisState["activeTab"]) => void;
  state: AnalysisState;
  reviewLoading: boolean;
  flowLoading: boolean;
  reqLoading: boolean;
  mrDescLoading: boolean;
  files: FileDiff[];
  onFileClick: (filename: string) => void;
  onExport: () => void;
  onExportJSON: () => void;
  onCopyClipboard: () => void;
  onPrint: () => void;
  hasExportData: boolean;
  notesValue: string;
  onNotesChange: (val: string) => void;
  onLoadHistory?: () => void;
  stats: {
    changedFiles: number;
    additions: number;
    deletions: number;
    commits: number;
    score?: number;
    issueCount: number;
    criticalCount: number;
    warningCount: number;
    costLabel?: string;
  };
}

/* ───── Tooltip wrapper for collapsed items ───── */
function SidebarTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-md text-xs font-medium text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
      {label}
      {children}
    </div>
  );
}

/* ───── Component ───── */
export function NavigationSidebar({
  activeTab, onTabChange, state, reviewLoading, flowLoading, reqLoading, mrDescLoading,
  files, onFileClick,
  onExport, onExportJSON, onCopyClipboard, onPrint, hasExportData,
  notesValue, onNotesChange,
  onLoadHistory,
  stats,
}: NavigationSidebarProps) {
  /* Expanded / collapsed state — persisted */
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("nav-sidebar-expanded") !== "false"; }
    catch { return true; }
  });
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(notesValue);
  const notesTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { localStorage.setItem("nav-sidebar-expanded", String(expanded)); } catch {}
  }, [expanded]);

  useEffect(() => { setLocalNotes(notesValue); }, [notesValue]);

  const { summary, executionFlow, codeReview, requirementsCheck, mrDescriptionReview } = state;
  const isAnalyzing = state.step !== "done" && state.step !== "error";

  /* ── Progress counter ── */
  const totalSteps = state.linkedIssueUrl ? 5 : 4; // summary, flow, review, mrDesc [, requirements]
  let completedSteps = 0;
  if (summary) completedSteps++;
  if (executionFlow) completedSteps++;
  if (codeReview) completedSteps++;
  if (mrDescriptionReview) completedSteps++;
  if (state.linkedIssueUrl && requirementsCheck) completedSteps++;

  /* ── File tree data ── */
  const filesByDir = files.reduce<Record<string, FileDiff[]>>((acc, file) => {
    const parts = file.filename.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    (acc[dir] ??= []).push(file);
    return acc;
  }, {});

  const issuesByFile = codeReview?.issues.reduce<Record<string, { critical: number; warning: number; suggestion: number }>>((acc, issue) => {
    if (!issue.file) return acc;
    if (!acc[issue.file]) acc[issue.file] = { critical: 0, warning: 0, suggestion: 0 };
    if (issue.severity === "critical") acc[issue.file].critical++;
    else if (issue.severity === "warning") acc[issue.file].warning++;
    else acc[issue.file].suggestion++;
    return acc;
  }, {}) ?? {};

  const allDirs = Object.keys(filesByDir).sort();
  if (expandedDirs.size === 0 && allDirs.length > 0) {
    allDirs.forEach((d) => expandedDirs.add(d));
  }

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.has(dir) ? next.delete(dir) : next.add(dir);
      return next;
    });
  };

  /* ── Helpers ── */
  const getNavState = (id: AnalysisState["activeTab"]) => {
    const isActive = activeTab === id;
    let isAvailable = false;
    let isLoading = false;
    let isPending = false;
    let badge: { count: number; color: string } | null = null;
    let preview = "";
    let disabledReason = "";

    switch (id) {
      case "summary":
        isAvailable = !!summary;
        isLoading = !summary && isAnalyzing;
        if (summary) preview = summary.changeType;
        if (!isAvailable && !isLoading) disabledReason = "Waiting for analysis...";
        break;
      case "flow":
        isAvailable = !!executionFlow;
        isLoading = flowLoading;
        isPending = !executionFlow && !flowLoading;
        if (executionFlow) preview = `${executionFlow.flowGroups.length} layers`;
        break;
      case "review":
        isAvailable = !!codeReview;
        isLoading = reviewLoading;
        isPending = !codeReview && !reviewLoading;
        if (codeReview) {
          preview = `${codeReview.overallScore}/10`;
          if (stats.criticalCount > 0) badge = { count: stats.criticalCount, color: "bg-destructive" };
          else if (stats.issueCount > 0) badge = { count: stats.issueCount, color: "bg-yellow-500" };
        }
        break;
      case "requirements":
        isAvailable = !!requirementsCheck;
        isLoading = reqLoading;
        isPending = !requirementsCheck && !reqLoading && !!state.linkedIssueUrl;
        if (requirementsCheck) preview = `${requirementsCheck.coverageScore}%`;
        if (!state.linkedIssueUrl) disabledReason = "No issue linked";
        break;
      case "mr-description":
        isAvailable = !!mrDescriptionReview;
        isLoading = mrDescLoading;
        isPending = !mrDescriptionReview && !mrDescLoading;
        if (mrDescriptionReview) preview = `${mrDescriptionReview.qualityScore}%`;
        break;
    }

    const canClick = isAvailable || isPending || isLoading;

    return { isActive, isAvailable, isLoading, isPending, badge, preview, canClick, disabledReason };
  };

  const handleNotesInput = (val: string) => {
    setLocalNotes(val);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => onNotesChange(val), 500);
  };

  /* Are there pending manual steps that could use attention? */
  const pendingFlow = !executionFlow && !flowLoading;
  const pendingReview = !codeReview && !reviewLoading;
  const pendingReq = !!state.linkedIssueUrl && !requirementsCheck && !reqLoading;
  const pendingMRDesc = !mrDescriptionReview && !mrDescLoading;
  const pendingCount = [pendingFlow, pendingReview, pendingReq, pendingMRDesc].filter(Boolean).length;

  /* ── Render ── */
  return (
    <>
      {/* ─ Desktop sidebar ─ */}
      <aside
        className={`hidden sm:flex flex-shrink-0 border-r border-border bg-card/50 flex-col transition-all duration-200 ease-out overflow-hidden ${
          expanded ? "w-64" : "w-14"
        }`}
      >
        {/* Header with progress */}
        <div className={`flex items-center ${expanded ? "justify-between px-3" : "justify-center px-1"} py-3 border-b border-border flex-shrink-0`}>
          {expanded && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest select-none">Nav</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium select-none">
                {completedSteps}/{totalSteps}
              </span>
              {isAnalyzing && <span className="w-2.5 h-2.5 border-[1.5px] border-muted-foreground/20 border-t-primary rounded-full animate-spin flex-shrink-0" />}
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
        </div>

        {/* Progress bar */}
        {expanded && (
          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5" role="navigation" aria-label="Analysis sections">
          {NAV_ITEMS.map((item) => {
            if (item.id === "requirements" && !state.linkedIssueUrl && !requirementsCheck) return null;

            const { isActive, isAvailable, isLoading, isPending, badge, preview, canClick, disabledReason } = getNavState(item.id);
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (canClick) {
                    onTabChange(item.id);
                  } else if (disabledReason) {
                    toast(disabledReason, { icon: "ℹ️", duration: 2000 });
                  }
                }}
                disabled={false}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all relative group ${
                  expanded ? "px-3 py-2.5" : "justify-center py-2.5"
                } ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : canClick
                    ? "text-foreground hover:bg-secondary/80"
                    : "text-muted-foreground/40 cursor-default"
                }`}
                title={!expanded ? `${item.label}${preview ? ` · ${preview}` : ""}${disabledReason ? ` (${disabledReason})` : ""} [${item.shortcut}]` : undefined}
              >
                {/* Active bar */}
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}

                <div className="relative flex-shrink-0">
                  <Icon size={16} />
                  {!expanded && badge && (
                    <span className={`absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full ${badge.color} text-background text-[8px] flex items-center justify-center font-bold px-0.5`}>
                      {badge.count}
                    </span>
                  )}
                  {!expanded && isLoading && (
                    <span className="absolute -bottom-1 -right-1 w-3 h-3 border-[1.5px] border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
                  )}
                </div>

                {expanded && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {preview && !isActive && (
                      <span className="text-[10px] text-muted-foreground font-normal truncate max-w-[60px]">{preview}</span>
                    )}
                    {badge && (
                      <span className={`min-w-[18px] h-[18px] rounded-full ${badge.color} text-background text-[10px] flex items-center justify-center font-bold px-1`}>
                        {badge.count}
                      </span>
                    )}
                    {isLoading && (
                      <span className="w-3.5 h-3.5 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin flex-shrink-0" />
                    )}
                    {isPending && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium flex-shrink-0">Run</span>
                    )}
                    <kbd className="text-[10px] text-muted-foreground/30 font-mono flex-shrink-0 hidden xl:block">{item.shortcut}</kbd>
                  </>
                )}

                {/* Tooltip for collapsed */}
                {!expanded && (
                  <SidebarTooltip label={item.label}>
                    {preview && <span className="text-muted-foreground ml-1.5">· {preview}</span>}
                  </SidebarTooltip>
                )}
              </button>
            );
          })}

          {/* ─ Pending banner ─ */}
          {expanded && pendingCount > 0 && !isAnalyzing && (
            <div className="!mt-2 mx-0.5 px-3 py-2 rounded-lg bg-accent/5 border border-accent/15">
              <div className="flex items-center gap-2 mb-1">
                <Play size={11} className="text-accent flex-shrink-0" />
                <span className="text-[11px] font-semibold text-accent">{pendingCount} pending check{pendingCount !== 1 ? "s" : ""}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {pendingFlow && "Execution Flow"}
                {pendingFlow && (pendingReview || pendingMRDesc || pendingReq) && ", "}
                {pendingReview && "Code Review"}
                {pendingReview && (pendingMRDesc || pendingReq) && ", "}
                {pendingMRDesc && "MR Description"}
                {pendingMRDesc && pendingReq && ", "}
                {pendingReq && "Requirements"}
                {" — click to run"}
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="!my-3 mx-2 border-t border-border" />

          {/* File tree toggle */}
          <button
            onClick={() => { if (!expanded) setExpanded(true); setFileTreeOpen(!fileTreeOpen); }}
            aria-expanded={fileTreeOpen}
            className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all relative group ${
              expanded ? "px-3 py-2.5" : "justify-center py-2.5"
            } ${fileTreeOpen ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}
            title={!expanded ? `Changed Files (${files.length})` : undefined}
          >
            <div className="relative flex-shrink-0">
              <FolderTree size={16} />
              {!expanded && (
                <span className="absolute -top-1.5 -right-2.5 text-[8px] min-w-[14px] h-[14px] rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground px-0.5">{files.length}</span>
              )}
            </div>
            {expanded && (
              <>
                <span className="flex-1 text-left">Changed Files</span>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-medium">{files.length}</span>
                {fileTreeOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </>
            )}
            {!expanded && (
              <SidebarTooltip label={`Changed Files (${files.length})`}>{null}</SidebarTooltip>
            )}
          </button>

          {/* ─ Inline file tree ─ */}
          {expanded && fileTreeOpen && (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border bg-background/50 mx-0.5 mt-1" role="tree">
              {allDirs.map((dir) => {
                const dirFiles = filesByDir[dir];
                const isExp = expandedDirs.has(dir);
                return (
                  <div key={dir} role="treeitem" aria-expanded={isExp}>
                    <button
                      onClick={() => toggleDir(dir)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                    >
                      {isExp ? <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground flex-shrink-0" />}
                      <span className="text-[11px] font-medium text-muted-foreground truncate flex-1" title={dir}>{dir}</span>
                      <span className="text-[10px] text-muted-foreground/50">{dirFiles.length}</span>
                    </button>
                    {isExp && dirFiles.map((file) => {
                      const sc = FILE_STATUS[file.status] ?? FILE_STATUS.modified;
                      const StatusIcon = sc.icon;
                      const fi = issuesByFile[file.filename];
                      return (
                        <button
                          key={file.filename}
                          onClick={() => onFileClick(file.filename)}
                          className="w-full flex items-center gap-1.5 pl-6 pr-2.5 py-1 text-left hover:bg-secondary/50 transition-colors"
                          title={file.filename}
                        >
                          <StatusIcon size={11} className={`${sc.color} flex-shrink-0`} />
                          <span className="text-[11px] text-foreground truncate flex-1">{file.filename.split("/").pop()}</span>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {fi?.critical ? <XCircle size={9} className="text-destructive" /> : null}
                            {fi?.warning ? <AlertTriangle size={9} className="text-yellow-500" /> : null}
                            {fi?.suggestion ? <MessageSquare size={9} className="text-blue-400" /> : null}
                          </div>
                          <div className="flex gap-0.5 flex-shrink-0 ml-0.5">
                            {file.additions > 0 && <span className="text-[9px] text-accent font-medium">+{file.additions}</span>}
                            {file.deletions > 0 && <span className="text-[9px] text-destructive font-medium">-{file.deletions}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        {/* Bottom section */}
        <div className="flex-shrink-0 border-t border-border">
          {/* Notes */}
          <div className="px-1.5 pt-1.5">
            <button
              onClick={() => { if (!expanded) setExpanded(true); setNotesOpen(!notesOpen); }}
              aria-expanded={notesOpen}
              className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all relative group ${
                expanded ? "px-3 py-2" : "justify-center py-2.5"
              } ${notesOpen ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}
              title={!expanded ? "Reviewer Notes" : undefined}
            >
              <div className="relative flex-shrink-0">
                <StickyNote size={16} />
                {!expanded && localNotes.trim() && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
              {expanded && (
                <>
                  <span className="flex-1 text-left">Notes</span>
                  {localNotes.trim() && !notesOpen && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  )}
                </>
              )}
              {!expanded && <SidebarTooltip label="Reviewer Notes">{null}</SidebarTooltip>}
            </button>
            {expanded && notesOpen && (
              <div className="px-1 pb-2 pt-1">
                <textarea
                  value={localNotes}
                  onChange={(e) => handleNotesInput(e.target.value)}
                  placeholder="Your private notes for this review. Saved to history and included in exports."
                  rows={3}
                  className="w-full px-2.5 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/40 text-foreground resize-y"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          {hasExportData && (
            <div className={`flex flex-wrap ${expanded ? "gap-1 px-3 pb-2" : "flex-col items-center gap-0.5 px-1 pb-2"}`}>
              <button
                onClick={onExport}
                className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary relative group ${
                  expanded ? "px-2.5 py-1.5" : "p-2"
                }`}
                title="Export as Markdown"
              >
                <Download size={14} />
                {expanded && <span>.md</span>}
                {!expanded && <SidebarTooltip label="Export .md">{null}</SidebarTooltip>}
              </button>
              <button
                onClick={onExportJSON}
                className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary relative group ${
                  expanded ? "px-2.5 py-1.5" : "p-2"
                }`}
                title="Export as JSON"
              >
                <Braces size={14} />
                {expanded && <span>.json</span>}
                {!expanded && <SidebarTooltip label="Export JSON">{null}</SidebarTooltip>}
              </button>
              <button
                onClick={onCopyClipboard}
                className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary relative group ${
                  expanded ? "px-2.5 py-1.5" : "p-2"
                }`}
                title="Copy to clipboard"
              >
                <ClipboardCopy size={14} />
                {expanded && <span>Copy</span>}
                {!expanded && <SidebarTooltip label="Copy to clipboard">{null}</SidebarTooltip>}
              </button>
              <button
                onClick={onPrint}
                className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary relative group ${
                  expanded ? "px-2.5 py-1.5" : "p-2"
                }`}
                title="Print"
              >
                <Printer size={14} />
                {expanded && <span>Print</span>}
                {!expanded && <SidebarTooltip label="Print">{null}</SidebarTooltip>}
              </button>
            </div>
          )}

          {/* History link */}
          {onLoadHistory && (
            <div className="px-1.5 pb-1">
              <button
                onClick={onLoadHistory}
                className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all relative group ${
                  expanded ? "px-3 py-2" : "justify-center py-2.5"
                } text-muted-foreground hover:text-foreground hover:bg-secondary/80`}
                title={!expanded ? "Recent Reviews" : undefined}
              >
                <Clock size={16} className="flex-shrink-0" />
                {expanded && <span className="flex-1 text-left text-xs">Recent Reviews</span>}
                {!expanded && <SidebarTooltip label="Recent Reviews">{null}</SidebarTooltip>}
              </button>
            </div>
          )}

          {/* Stats footer */}
          {expanded && (
            <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap select-none">
              <span>{stats.changedFiles} files</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-accent font-medium flex items-center gap-0.5"><Plus size={8} />{stats.additions.toLocaleString()}</span>
              <span className="text-destructive font-medium flex items-center gap-0.5"><Minus size={8} />{stats.deletions.toLocaleString()}</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{stats.commits} commit{stats.commits !== 1 ? "s" : ""}</span>
              {stats.score !== undefined && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className={`font-semibold ${stats.score >= 8 ? "text-accent" : stats.score >= 6 ? "text-yellow-500" : "text-destructive"}`}>
                    {stats.score}/10
                  </span>
                </>
              )}
              {stats.costLabel && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{stats.costLabel}</span>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ─ Mobile bottom tab bar (sm: and below) ─ */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md flex items-center justify-around px-1 py-1.5 safe-bottom" role="navigation" aria-label="Analysis sections">
        {NAV_ITEMS.map((item) => {
          if (item.id === "requirements" && !state.linkedIssueUrl && !requirementsCheck) return null;
          const { isActive, isAvailable, isLoading, isPending, badge, canClick, disabledReason } = getNavState(item.id);
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (canClick) onTabChange(item.id);
                else if (disabledReason) toast(disabledReason, { icon: "ℹ️", duration: 2000 });
              }}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors relative min-w-0 ${
                isActive
                  ? "text-primary"
                  : canClick
                  ? "text-muted-foreground"
                  : "text-muted-foreground/30"
              }`}
            >
              <div className="relative">
                <Icon size={18} />
                {badge && (
                  <span className={`absolute -top-1 -right-2 min-w-[12px] h-[12px] rounded-full ${badge.color} text-background text-[7px] flex items-center justify-center font-bold px-0.5`}>
                    {badge.count}
                  </span>
                )}
                {isLoading && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-[1.5px] border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
                )}
                {isPending && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
                )}
              </div>
              <span className="text-[9px] font-medium truncate max-w-[56px]">{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
