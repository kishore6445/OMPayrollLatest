import type { PendingFilingBatch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMonth } from "@/lib/fmt";
import { CheckCircle, ChevronRight, Clock } from "lucide-react";

export function PendingFilingsPanel({
  title,
  items,
  emptyMessage,
  onSelect,
  loading,
}: {
  title: string;
  items: PendingFilingBatch[];
  emptyMessage: string;
  onSelect: (batchId: string) => void;
  loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          {title}
          {items.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{items.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading && <div className="text-xs text-muted-foreground py-2">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            {emptyMessage}
          </div>
        )}
        {!loading && items.map((b) => (
          <button
            key={b.batchId}
            type="button"
            onClick={() => onSelect(b.batchId)}
            className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-muted/50 cursor-pointer text-xs text-left"
            data-testid={`pending-filing-${b.batchId}`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{b.name}</span>
              <span className="text-muted-foreground">{fmtMonth(b.month)}</span>
            </div>
            <div className="flex items-center gap-2">
              {b.daysSinceLock != null && (
                <Badge variant={b.daysSinceLock > 15 ? "destructive" : "secondary"} className="text-[10px] px-1.5">
                  {b.daysSinceLock === 0 ? "Locked today" : `${b.daysSinceLock}d since lock`}
                </Badge>
              )}
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
