import { ReactNode } from "react";
import { Check, Circle } from "lucide-react";

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  current: number;
  className?: string;
}

export function Stepper({ steps, current, className = "" }: StepperProps) {
  return (
    <div className={`flex items-start gap-0 ${className}`}>
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const last = idx === steps.length - 1;
        return (
          <div key={step.id} className="flex items-start flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 ${
                done ? "bg-primary border-primary text-primary-foreground" :
                active ? "border-primary bg-primary/10 text-primary" :
                "border-border bg-muted text-muted-foreground"
              }`}>
                {done ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{idx + 1}</span>}
              </div>
              <div className="mt-1.5 text-center px-1">
                <p className={`text-[11px] font-semibold leading-tight ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                {step.description && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{step.description}</p>}
              </div>
            </div>
            {!last && (
              <div className={`flex-1 h-0.5 mt-4 mx-2 ${idx < current ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
