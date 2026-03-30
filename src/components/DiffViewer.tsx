import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Minus, FilePlus, FileX, FilePen } from "lucide-react";
import type { FileDiff } from "../types";

interface DiffViewerProps {
  file: FileDiff;
  defaultOpen?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "added": return <FilePlus size={13} className="text-accent" />;
    case "removed": return <FileX size={13} className="text-destructive" />;
    default: return <FilePen size={13} className="text-yellow-500" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "added": return "text-accent bg-accent/10 border-accent/20";
    case "removed": return "text-destructive bg-destructive/10 border-destructive/20";
    default: return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-500/10 dark:border-yellow-500/20";
  }
}

function renderPatch(patch: string) {
  const lines = patch.split("\n");
  return lines.map((line, i) => {
    let bg = "";
    let textColor = "text-foreground";
    let prefix = "";

    if (line.startsWith("+") && !line.startsWith("+++")) {
      bg = "bg-accent/8 dark:bg-accent/10";
      textColor = "text-accent";
      prefix = "+";
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      bg = "bg-destructive/8 dark:bg-destructive/10";
      textColor = "text-destructive";
      prefix = "-";
    } else if (line.startsWith("@@")) {
      bg = "bg-secondary";
      textColor = "text-muted-foreground";
    } else if (line.startsWith("\\")) {
      textColor = "text-muted-foreground";
    }

    return (
      <div key={i} className={`flex ${bg} min-w-0`}>
        <span className={`select-none w-5 text-right pr-1.5 flex-shrink-0 text-xs font-mono ${textColor} opacity-60 py-0.5`}>
          {prefix || " "}
        </span>
        <span className={`flex-1 text-xs font-mono ${textColor} py-0.5 pr-2 break-all whitespace-pre-wrap`}>
          {line}
        </span>
      </div>
    );
  });
}

export function DiffViewer({ file, defaultOpen = false }: DiffViewerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const filename = file.filename.split("/").pop() ?? file.filename;
  const filepath = file.filename.substring(0, file.filename.length - filename.length);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
      >
        {getStatusIcon(file.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono truncate">{filepath}</span>
            <span className="text-sm font-medium text-foreground font-mono">{filename}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border font-medium ${getStatusColor(file.status)}`}>
            {file.status}
          </span>
          <span className="text-xs text-accent font-medium">+{file.additions}</span>
          <span className="text-xs text-destructive font-medium">-{file.deletions}</span>
          {isOpen ? (
            <ChevronUp size={15} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={15} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border">
          {file.patch ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto bg-background/50">
              <div className="min-w-0 p-0">
                {renderPatch(file.patch)}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No diff available (binary file or no changes)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffStats({ additions, deletions, changedFiles }: { additions: number; deletions: number; changedFiles: number }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded flex items-center justify-center bg-accent/10">
          <Plus size={10} className="text-accent" />
        </div>
        <span className="text-accent font-semibold">+{additions.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded flex items-center justify-center bg-destructive/10">
          <Minus size={10} className="text-destructive" />
        </div>
        <span className="text-destructive font-semibold">-{deletions.toLocaleString()}</span>
      </div>
      <div className="text-muted-foreground">
        {changedFiles} file{changedFiles !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
