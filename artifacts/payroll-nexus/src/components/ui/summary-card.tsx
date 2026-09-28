import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  title: string;
  value: string | number | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
  loading?: boolean;
  footer?: ReactNode;
}

const VARIANTS: Record<string, { card: string; icon: string }> = {
  default: { card: "", icon: "bg-primary/10 text-primary" },
  success: { card: "border-green-200 dark:border-green-800", icon: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  warning: { card: "border-amber-200 dark:border-amber-800", icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  error: { card: "border-red-200 dark:border-red-800", icon: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  info: { card: "border-blue-200 dark:border-blue-800", icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function SummaryCard({ title, value, subtitle, icon, variant = "default", className, loading, footer }: SummaryCardProps) {
  const v = VARIANTS[variant];
  return (
    <Card className={cn("border-border/60", v.card, className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {icon && <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", v.icon)}>{icon}</div>}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            {loading ? <div className="h-6 w-20 bg-muted animate-pulse rounded mt-1" /> :
              <div className="text-xl font-bold mt-0.5 leading-tight">{value}</div>}
            {subtitle && !loading && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {footer && !loading && <div className="mt-3 pt-3 border-t border-border/40">{footer}</div>}
      </CardContent>
    </Card>
  );
}
