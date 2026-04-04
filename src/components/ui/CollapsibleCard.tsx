import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";

interface CollapsibleCardProps {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  icon,
  badge,
  defaultExpanded = true,
  className,
  headerClassName,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={clsx("rounded-2xl border border-border bg-card overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={clsx(
          "w-full flex items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
          headerClassName,
        )}
      >
        {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {badge && <span className="flex-shrink-0">{badge}</span>}
        {expanded ? (
          <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {expanded && (
        <div className={clsx("px-4 pb-4", contentClassName)}>{children}</div>
      )}
    </div>
  );
}
