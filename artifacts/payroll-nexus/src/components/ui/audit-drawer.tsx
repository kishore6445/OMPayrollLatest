import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";
import { fmtDateTime } from "@/lib/fmt";

interface AuditDrawerProps {
  entityId: string;
  entityType: string;
  trigger?: React.ReactNode;
}

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

export function AuditDrawer({ entityId, entityType, trigger }: AuditDrawerProps) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["audit-entity", entityType, entityId],
    queryFn: () => fetch(`/api/audit-logs?entityId=${entityId}&entityType=${entityType}`, { headers: hdr() }).then((r) => r.json()),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-xs h-7">
            <ScrollText className="h-3.5 w-3.5 mr-1.5" />Audit Trail
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-96 sm:w-[440px]">
        <SheetHeader>
          <SheetTitle className="text-sm">Audit Trail</SheetTitle>
          <p className="text-xs text-muted-foreground">{entityType} · {entityId}</p>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-auto max-h-[calc(100vh-120px)]">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)
          ) : data.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No audit records found.</p>
          ) : (
            data.map((e: any, i: number) => (
              <div key={i} className="rounded-lg border border-border/60 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">{e.action}</Badge>
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{e.userName ?? "System"}</p>
                {e.changes && (
                  <p className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-2 py-1 truncate">
                    {typeof e.changes === "object" ? JSON.stringify(e.changes).slice(0, 80) : String(e.changes)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
