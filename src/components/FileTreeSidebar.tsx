import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderTree, FileText, FilePlus, FileX, FileEdit, FileSymlink,
  ChevronRight, ChevronDown, XCircle, AlertTriangle, MessageSquare, X
} from "lucide-react";
import type { FileDiff, CodeReview } from "../types";

interface FileTreeSidebarProps {
  files: FileDiff[];
  codeReview?: CodeReview | null;
  onFileClick?: (filename: string) => void;
  open: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  added: { icon: FilePlus, color: "text-accent", label: "A" },
  modified: { icon: FileEdit, color: "text-yellow-500", label: "M" },
  removed: { icon: FileX, color: "text-destructive", label: "D" },
  renamed: { icon: FileSymlink, color: "text-blue-500", label: "R" },
};

function getFileDir(filename: string): string {
  const parts = filename.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function getFileName(filename: string): string {
  return filename.split("/").pop() ?? filename;
}

export function FileTreeSidebar({ files, codeReview, onFileClick, open, onClose }: FileTreeSidebarProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Group files by directory
  const filesByDir = files.reduce<Record<string, FileDiff[]>>((acc, file) => {
    const dir = getFileDir(file.filename) || "(root)";
    if (!acc[dir]) acc[dir] = [];
    acc[dir].push(file);
    return acc;
  }, {});

  // Build issue counts per file
  const issuesByFile = codeReview?.issues.reduce<Record<string, { critical: number; warning: number; suggestion: number }>>((acc, issue) => {
    if (!issue.file) return acc;
    if (!acc[issue.file]) acc[issue.file] = { critical: 0, warning: 0, suggestion: 0 };
    if (issue.severity === "critical") acc[issue.file].critical++;
    else if (issue.severity === "warning") acc[issue.file].warning++;
    else acc[issue.file].suggestion++;
    return acc;
  }, {}) ?? {};

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir); else next.add(dir);
      return next;
    });
  };

  // Auto-expand all dirs on mount
  const allDirs = Object.keys(filesByDir);
  if (expandedDirs.size === 0 && allDirs.length > 0) {
    // Initialize all expanded
    allDirs.forEach((d) => expandedDirs.add(d));
  }

  const sortedDirs = allDirs.sort();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex-shrink-0 border-r border-border bg-card overflow-hidden"
        >
          <div className="w-[280px] h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <FolderTree size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Changed Files</span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{files.length}</span>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </div>

            {/* File tree */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
              {sortedDirs.map((dir) => {
                const dirFiles = filesByDir[dir];
                const isExpanded = expandedDirs.has(dir);
                const dirIssues = dirFiles.reduce(
                  (acc, f) => {
                    const fi = issuesByFile[f.filename];
                    if (fi) {
                      acc.critical += fi.critical;
                      acc.warning += fi.warning;
                      acc.suggestion += fi.suggestion;
                    }
                    return acc;
                  },
                  { critical: 0, warning: 0, suggestion: 0 }
                );

                return (
                  <div key={dir}>
                    {/* Directory header */}
                    <button
                      onClick={() => toggleDir(dir)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-secondary/50 transition-colors group"
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium text-muted-foreground truncate flex-1" title={dir}>
                        {dir}
                      </span>
                      <span className="text-xs text-muted-foreground/60 flex-shrink-0">{dirFiles.length}</span>
                      {dirIssues.critical > 0 && (
                        <span className="w-3.5 h-3.5 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-destructive">{dirIssues.critical}</span>
                        </span>
                      )}
                    </button>

                    {/* Files in directory */}
                    {isExpanded && (
                      <div>
                        {dirFiles.map((file) => {
                          const statusConfig = STATUS_CONFIG[file.status] ?? STATUS_CONFIG.modified;
                          const StatusIcon = statusConfig.icon;
                          const fileIssues = issuesByFile[file.filename];

                          return (
                            <button
                              key={file.filename}
                              onClick={() => onFileClick?.(file.filename)}
                              className="w-full flex items-center gap-1.5 pl-7 pr-3 py-1.5 text-left hover:bg-secondary/50 transition-colors group"
                              title={file.filename}
                            >
                              <StatusIcon size={12} className={`${statusConfig.color} flex-shrink-0`} />
                              <span className="text-xs text-foreground truncate flex-1">
                                {getFileName(file.filename)}
                              </span>

                              {/* Issue indicators */}
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {fileIssues?.critical ? (
                                  <span className="flex items-center gap-0.5 text-destructive" title={`${fileIssues.critical} critical`}>
                                    <XCircle size={10} />
                                    <span className="text-[9px] font-bold">{fileIssues.critical}</span>
                                  </span>
                                ) : null}
                                {fileIssues?.warning ? (
                                  <span className="flex items-center gap-0.5 text-yellow-500" title={`${fileIssues.warning} warnings`}>
                                    <AlertTriangle size={10} />
                                    <span className="text-[9px] font-bold">{fileIssues.warning}</span>
                                  </span>
                                ) : null}
                                {fileIssues?.suggestion ? (
                                  <span className="flex items-center gap-0.5 text-blue-500" title={`${fileIssues.suggestion} suggestions`}>
                                    <MessageSquare size={10} />
                                    <span className="text-[9px] font-bold">{fileIssues.suggestion}</span>
                                  </span>
                                ) : null}
                              </div>

                              {/* +/- stats */}
                              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                                {file.additions > 0 && (
                                  <span className="text-[10px] font-medium text-accent">+{file.additions}</span>
                                )}
                                {file.deletions > 0 && (
                                  <span className="text-[10px] font-medium text-destructive">-{file.deletions}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
