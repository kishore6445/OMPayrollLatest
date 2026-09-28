import { AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { ReactNode } from "react";

type ValidationVariant = "error" | "success" | "warning" | "info";

const CFG: Record<ValidationVariant, { icon: any; className: string }> = {
  error: { icon: AlertCircle, className: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300" },
  success: { icon: CheckCircle, className: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300" },
  warning: { icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" },
  info: { icon: Info, className: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300" },
};

interface ValidationMessageProps {
  variant: ValidationVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function ValidationMessage({ variant, title, children, className = "" }: ValidationMessageProps) {
  const cfg = CFG[variant];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${cfg.className} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
