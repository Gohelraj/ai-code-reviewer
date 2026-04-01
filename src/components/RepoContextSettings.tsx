import { BookOpenText } from "lucide-react";
import type { AIConfig } from "./AISettings";

interface RepoContextSettingsProps {
  config: AIConfig;
  onChange: (config: AIConfig) => void;
  disabled?: boolean;
}

export function RepoContextSettings({ config, onChange, disabled }: RepoContextSettingsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <BookOpenText size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Repo Context</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Save stable context for this repository so reviews reflect the real purpose, business rules, intentional patterns, and known exceptions of the codebase.
          </p>
        </div>
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
      </div>
    </div>
  );
}
