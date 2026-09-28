import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  // Worker/General
  active:           { label: "Active",          color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  inactive:         { label: "Inactive",         color: "bg-slate-100 text-slate-600 border-slate-200" },
  exited:           { label: "Exited",           color: "bg-slate-100 text-slate-500 border-slate-200" },
  // Payroll batch lifecycle
  draft:            { label: "Draft",            color: "bg-slate-100 text-slate-600 border-slate-200" },
  calculating:      { label: "Calculating…",     color: "bg-violet-100 text-violet-700 border-violet-200" },
  calculated:       { label: "Calculated",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  exceptions_open:  { label: "Exceptions",       color: "bg-amber-100 text-amber-800 border-amber-200" },
  submitted:        { label: "Submitted",        color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  approved:         { label: "Approved",         color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  locked:           { label: "Locked",           color: "bg-purple-100 text-purple-800 border-purple-200" },
  reopened:         { label: "Reopened",         color: "bg-orange-100 text-orange-700 border-orange-200" },
  // Attendance lifecycle
  uploaded:         { label: "Uploaded",         color: "bg-slate-100 text-slate-600 border-slate-200" },
  validated:        { label: "Validated",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  // Exception / alert
  open:             { label: "Open",             color: "bg-amber-100 text-amber-800 border-amber-200" },
  resolved:         { label: "Resolved",         color: "bg-teal-100 text-teal-700 border-teal-200" },
  waived:           { label: "Waived",           color: "bg-slate-100 text-slate-500 border-slate-200" },
  error:            { label: "Error",            color: "bg-red-100 text-red-800 border-red-200" },
  warning:          { label: "Warning",          color: "bg-amber-100 text-amber-700 border-amber-200" },
  info:             { label: "Info",             color: "bg-sky-100 text-sky-700 border-sky-200" },
  // Finance / billing
  pending:          { label: "Pending",          color: "bg-amber-100 text-amber-700 border-amber-200" },
  generated:        { label: "Generated",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  downloaded:       { label: "Downloaded",       color: "bg-teal-100 text-teal-700 border-teal-200" },
  paid:             { label: "Paid",             color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:        { label: "Cancelled",        color: "bg-red-100 text-red-700 border-red-200" },
  overdue:          { label: "Overdue",          color: "bg-red-100 text-red-800 border-red-200" },
  // Bank reconciliation
  reconciled:       { label: "Reconciled",       color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  mismatch:         { label: "Mismatch",         color: "bg-red-100 text-red-700 border-red-200" },
  // Verification
  verified:         { label: "Verified",         color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  unverified:       { label: "Unverified",       color: "bg-amber-100 text-amber-700 border-amber-200" },
  rejected:         { label: "Rejected",         color: "bg-red-100 text-red-700 border-red-200" },
  // System jobs
  running:          { label: "Running",          color: "bg-blue-100 text-blue-700 border-blue-200" },
  completed:        { label: "Completed",        color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed:           { label: "Failed",           color: "bg-red-100 text-red-800 border-red-200" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status.replace(/_/g, " "), color: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${cfg.color} ${className}`}>
      {cfg.label}
    </span>
  );
}
