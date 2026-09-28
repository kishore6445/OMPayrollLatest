import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
  loading?: boolean;
  variant?: "default" | "success" | "warning" | "error" | "info";
}

const VARIANT_STYLES: Record<string, { card: string; icon: string; value: string }> = {
  default: {
    card:  "border-border/50 bg-card",
    icon:  "bg-primary/8 text-primary",
    value: "text-foreground",
  },
  success: {
    card:  "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20",
    icon:  "bg-emerald-100 text-emerald-700",
    value: "text-emerald-800 dark:text-emerald-300",
  },
  warning: {
    card:  "border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20",
    icon:  "bg-amber-100 text-amber-700",
    value: "text-amber-800 dark:text-amber-300",
  },
  error: {
    card:  "border-red-200/70 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/20",
    icon:  "bg-red-100 text-red-700",
    value: "text-red-800 dark:text-red-300",
  },
  info: {
    card:  "border-sky-200/70 bg-sky-50/60 dark:border-sky-800/40 dark:bg-sky-950/20",
    icon:  "bg-sky-100 text-sky-700",
    value: "text-sky-800 dark:text-sky-300",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = "",
  loading = false,
  variant = "default",
}: StatCardProps) {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

  return (
    <Card className={`${styles.card} ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              {title}
            </p>
            {loading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded mt-1.5" />
            ) : (
              <p className={`text-[22px] font-bold tracking-tight mt-1 truncate leading-none ${styles.value}`}>
                {value}
              </p>
            )}
            {subtitle && !loading && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{subtitle}</p>
            )}
            {trend && !loading && (
              <div
                className={`flex items-center gap-1 mt-1.5 text-[11px] font-medium ${
                  trend.value > 0
                    ? "text-emerald-600"
                    : trend.value < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                {trend.value > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : trend.value < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                <span>
                  {Math.abs(trend.value).toFixed(1)}% {trend.label ?? "vs last month"}
                </span>
              </div>
            )}
          </div>
          {icon && (
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${styles.icon}`}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
