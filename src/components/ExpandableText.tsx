import { useMemo, useState, useEffect } from "react";
import clsx from "clsx";

interface ExpandableTextProps {
  text: string;
  collapsedLines?: number;
  minLength?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
  defaultExpanded?: boolean;
  preserveWhitespace?: boolean;
}

export function ExpandableText({
  text,
  collapsedLines = 3,
  minLength = 160,
  className,
  moreLabel = "Show more",
  lessLabel = "Show less",
  defaultExpanded = false,
  preserveWhitespace = false,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);
  const normalized = text.trim();
  const canExpand = useMemo(
    () => normalized.length > minLength || normalized.split("\n").length > collapsedLines,
    [normalized, minLength, collapsedLines],
  );

  if (!normalized) return null;

  return (
    <div>
      <div
        className={clsx(className, preserveWhitespace && "whitespace-pre-wrap")}
        style={!expanded && canExpand
          ? {
              display: "-webkit-box",
              WebkitLineClamp: collapsedLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }
          : undefined}
      >
        {normalized}
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
