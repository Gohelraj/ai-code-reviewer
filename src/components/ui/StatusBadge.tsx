import type { ReactNode } from "react";
import clsx from "clsx";

type StatusBadgeVariant = "critical" | "warning" | "success" | "info";
type StatusBadgeSize = "sm" | "md";

const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400",
  success: "bg-accent/10 text-accent border-accent/20",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
};

const SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: "text-xs px-1.5 py-0.5 gap-1",
  md: "text-sm px-2.5 py-1 gap-1.5",
};

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  size?: StatusBadgeSize;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({
  variant,
  size = "md",
  icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-medium rounded-full border",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
