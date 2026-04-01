import { useState } from "react";
import { BookOpenText, RefreshCw, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import type { AIConfig } from "./AISettings";
import { generateRepoContext } from "../lib/api";

interface RepoContextSettingsProps {
  config: AIConfig;
  onChange: (config: AIConfig) => void;
  disabled?: boolean;
  repoUrl?: string;
  repoToken?: string;
}

export function RepoContextSettings({ config, onChange, disabled, repoUrl, repoToken }: RepoContextSettingsProps) {
  const [generating, setGenerating] = useState(false);
  const canGenerate = !!repoUrl && !!config.apiKey && !disabled && !generating;
  const hasRepoContext = !!config.repoMemory?.trim();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <BookOpenText size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Repo Context</p>
            {hasRepoContext && (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                Loaded for this repo
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Save stable context for this repository so reviews reflect the real purpose, business rules, intentional patterns, and known exceptions of the codebase.
          </p>
        </div>
        <button
          type="button"
          disabled={!canGenerate}
          onClick={async () => {
            if (!repoUrl) {
              toast.error("Paste or open a repo MR/PR URL first.");
              return;
            }
            setGenerating(true);
            try {
              const generated = await generateRepoContext(repoUrl, config, repoToken);
              onChange({ ...config, repoMemory: generated });
              toast.success("Repo context generated from repository files");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to generate repo context");
            } finally {
              setGenerating(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? "Generating..." : "Generate from Repository"}
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Repo Review Memory</p>
        <textarea
          value={config.repoMemory ?? ""}
          onChange={(e) => onChange({ ...config, repoMemory: e.target.value })}
          placeholder="e.g. This repo handles payment reconciliation. Eventual consistency is intentional. Prefer service-layer validation over controller validation. Do not flag missing DTO classes by default. Prioritize money movement, idempotency, auditability, and rollback safety."
          disabled={disabled}
          rows={6}
          className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all placeholder:text-muted-foreground/50 text-foreground resize-y"
        />
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Good entries include repo purpose, domain constraints, approved patterns, high-risk areas, and what the reviewer should avoid flagging by default.
        </p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Generate uses a small high-signal set of repo files such as `README`, docs, config, and entrypoint-related files from the repository default branch.
        </p>
        {hasRepoContext && (
          <p className="text-xs text-accent mt-2 leading-relaxed">
            This saved repo context will be injected into future code reviews for this repository.
          </p>
        )}
      </div>
    </div>
  );
}
