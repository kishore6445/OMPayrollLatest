import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";

interface FilterOption { value: string; label: string }

export interface FilterConfig {
  key: string;
  placeholder: string;
  type: "select" | "search";
  options?: FilterOption[];
  width?: string;
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
  right?: ReactNode;
  className?: string;
}

export function FilterBar({ filters, values, onChange, onReset, right, className = "" }: FilterBarProps) {
  const isDirty = filters.some((f) => values[f.key] && values[f.key] !== "all");
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {filters.map((f) => {
        if (f.type === "search") {
          return (
            <div key={f.key} className={`relative ${f.width ?? "w-52"}`}>
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />
            </div>
          );
        }
        return (
          <Select key={f.key} value={values[f.key] ?? "all"} onValueChange={(v) => onChange(f.key, v)}>
            <SelectTrigger className={`h-8 text-xs ${f.width ?? "w-40"}`}>
              <SelectValue placeholder={f.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{f.placeholder}</SelectItem>
              {f.options?.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      })}
      {onReset && isDirty && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onReset}>
          <RotateCcw className="h-3 w-3 mr-1" />Reset
        </Button>
      )}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
