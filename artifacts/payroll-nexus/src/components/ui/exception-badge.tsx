import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

const SEVERITY_MAP: Record<string, { icon: any; className: string; label: string }> = {
  error: { icon: AlertCircle, className: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400", label: "Critical" },
  warning: { icon: AlertTriangle, className: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400", label: "Warning" },
  info: { icon: Info, className: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400", label: "Info" },
  resolved: { icon: CheckCircle, className: "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400", label: "Resolved" },
};

interface ExceptionBadgeProps {
  severity: "error" | "warning" | "info" | "resolved";
  message: string;
  className?: string;
  compact?: boolean;
}

export function ExceptionBadge({ severity, message, className = "", compact = false }: ExceptionBadgeProps) {
  const cfg = SEVERITY_MAP[severity] ?? SEVERITY_MAP.warning;
  const Icon = cfg.icon;
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${cfg.className} ${className}`}>
        <Icon className="h-3 w-3 shrink-0" />{cfg.label}
      </span>
    );
  }
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${cfg.className} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function ExceptionSummary({ errors, warnings, infos }: { errors: number; warnings: number; infos?: number }) {
  if (errors + warnings + (infos ?? 0) === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium bg-green-50 border-green-200 text-green-700">
        <CheckCircle className="h-3 w-3" />Clean
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {errors > 0 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-red-50 border-red-200 text-red-700"><AlertCircle className="h-3 w-3" />{errors}</span>}
      {warnings > 0 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-amber-50 border-amber-200 text-amber-700"><AlertTriangle className="h-3 w-3" />{warnings}</span>}
      {(infos ?? 0) > 0 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-blue-50 border-blue-200 text-blue-700"><Info className="h-3 w-3" />{infos}</span>}
    </div>
  );
}
