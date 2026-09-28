import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface JobProgressProps {
  status: "running" | "done" | "error" | "pending";
  progress?: number;
  total?: number;
  label?: string;
  error?: string;
  className?: string;
}

export function JobProgress({ status, progress = 0, total = 100, label, error, className = "" }: JobProgressProps) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          {status === "done" && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
          {status === "error" && <XCircle className="h-3.5 w-3.5 text-red-600" />}
          <span className="font-medium">{label ?? (status === "running" ? "Processing…" : status === "done" ? "Complete" : status === "error" ? "Failed" : "Pending")}</span>
        </div>
        <span className="text-muted-foreground">{status !== "pending" && `${progress} / ${total}`}</span>
      </div>
      {status !== "pending" && (
        <Progress value={pct} className={`h-1.5 ${status === "error" ? "[&>div]:bg-red-500" : status === "done" ? "[&>div]:bg-green-500" : ""}`} />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
