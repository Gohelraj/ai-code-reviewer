import { Rows3, AlignJustify } from "lucide-react";

export type ResultViewMode = "compact" | "detailed";

interface ResultViewToggleProps {
  value: ResultViewMode;
  onChange: (value: ResultViewMode) => void;
}

export function ResultViewToggle({ value, onChange }: ResultViewToggleProps) {
  return (
    <div className="hidden sm:flex items-center rounded-lg border border-border overflow-hidden bg-secondary flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange("compact")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
          value === "compact"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Compact result view"
      >
        <Rows3 size={12} />
        Compact
      </button>
      <button
        type="button"
        onClick={() => onChange("detailed")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
          value === "detailed"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Detailed result view"
      >
        <AlignJustify size={12} />
        Detailed
      </button>
    </div>
  );
}
