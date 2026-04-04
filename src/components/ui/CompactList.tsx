import { useState, type ReactNode } from "react";

interface CompactListProps {
  items: ReactNode[];
  initialVisible?: number;
  showMoreText?: string;
  showLessText?: string;
}

export function CompactList({
  items,
  initialVisible = 5,
  showMoreText,
  showLessText = "Show less",
}: CompactListProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, initialVisible);
  const hiddenCount = items.length - initialVisible;

  return (
    <div className="space-y-3">
      {visible}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-2 rounded-xl hover:bg-secondary"
        >
          {showMoreText ?? `Show ${hiddenCount} more`}
        </button>
      )}
      {showAll && items.length > initialVisible && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-2 rounded-xl hover:bg-secondary"
        >
          {showLessText}
        </button>
      )}
    </div>
  );
}
