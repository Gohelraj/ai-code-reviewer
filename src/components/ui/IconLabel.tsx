import type { ReactNode } from "react";
import clsx from "clsx";

interface IconLabelProps {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function IconLabel({ icon, children, className }: IconLabelProps) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
      {children}
    </span>
  );
}
