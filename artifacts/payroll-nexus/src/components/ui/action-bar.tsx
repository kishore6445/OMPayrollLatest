import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionBarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function ActionBar({ left, right, className, sticky }: ActionBarProps) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 py-2.5 border border-border/60 rounded-lg bg-card/80 backdrop-blur-sm",
      sticky && "sticky top-0 z-20",
      className
    )}>
      <div className="flex items-center gap-2 flex-wrap">{left}</div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}
