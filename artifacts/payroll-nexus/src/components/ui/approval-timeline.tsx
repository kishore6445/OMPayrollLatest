import { ReactNode } from "react";
import { Check, X, Clock, User, AlertCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/fmt";

export interface TimelineEvent {
  status: "done" | "current" | "pending" | "rejected";
  label: string;
  actor?: string;
  timestamp?: string;
  note?: string;
}

interface ApprovalTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const ICONS: Record<string, ReactNode> = {
  done: <Check className="h-3.5 w-3.5" />,
  rejected: <X className="h-3.5 w-3.5" />,
  current: <Clock className="h-3.5 w-3.5" />,
  pending: <Circle className="h-3.5 w-3.5" />,
};

function Circle(props: any) {
  return <div className={`w-2 h-2 rounded-full bg-current ${props.className ?? ""}`} />;
}

const COLORS: Record<string, string> = {
  done: "bg-green-500 text-white border-green-500",
  rejected: "bg-red-500 text-white border-red-500",
  current: "bg-amber-500 text-white border-amber-500",
  pending: "bg-muted text-muted-foreground border-border",
};

export function ApprovalTimeline({ events, className = "" }: ApprovalTimelineProps) {
  return (
    <div className={`space-y-0 ${className}`}>
      {events.map((ev, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${COLORS[ev.status]}`}>
              {ev.status === "done" ? <Check className="h-3.5 w-3.5" /> :
               ev.status === "rejected" ? <X className="h-3.5 w-3.5" /> :
               ev.status === "current" ? <Clock className="h-3.5 w-3.5" /> :
               <div className="w-2 h-2 rounded-full bg-current" />}
            </div>
            {idx < events.length - 1 && <div className="w-0.5 flex-1 bg-border my-1 min-h-4" />}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <p className={`text-xs font-semibold ${ev.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{ev.label}</p>
            {ev.actor && <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><User className="h-3 w-3" />{ev.actor}{ev.timestamp && ` · ${fmtDateTime(ev.timestamp)}`}</p>}
            {ev.note && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{ev.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
