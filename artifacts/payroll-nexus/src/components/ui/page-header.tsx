import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: boolean | string;
  badge?: ReactNode;
  icon?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, back, badge, icon }: PageHeaderProps) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex items-start justify-between gap-4 pb-5 border-b border-border/40 mb-6">
      <div className="flex items-start gap-2.5 min-w-0">
        {back && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() =>
              typeof back === "string" ? setLocation(back) : history.back()
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
            <h1 className="text-[17px] font-bold tracking-tight text-foreground leading-snug">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
