import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        {message ?? "Statutory values (PF, ESI, PT, LWF) are illustrative placeholder calculations. Validate against current notifications and consult a qualified payroll/compliance SME before filing."}
      </span>
    </div>
  );
}
