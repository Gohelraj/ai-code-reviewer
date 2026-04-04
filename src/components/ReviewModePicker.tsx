import type { ReviewMode } from "./AISettings";

interface ReviewModePickerProps {
  value: ReviewMode;
  onChange: (mode: ReviewMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ReviewModePicker({ value, onChange, disabled = false, compact = false }: ReviewModePickerProps) {
  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <div className={`flex ${compact ? "items-center gap-3" : "items-start justify-between gap-4"}`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Depth</p>
          {!compact && (
            <p className="mt-1 text-xs text-muted-foreground">
              Quick keeps review latency lower. Deep uses more context for broader analysis.
            </p>
          )}
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as ReviewMode)}
          disabled={disabled}
          className="min-w-[132px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-all disabled:opacity-50"
        >
          <option value="quick">Quick review</option>
          <option value="deep">Deep review</option>
        </select>
      </div>
    </div>
  );
}
