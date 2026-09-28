import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MonthPickerProps {
  value: string;
  onChange: (month: string) => void;
  label?: string;
  monthsBack?: number;
  className?: string;
}

export function MonthPicker({ value, onChange, label = "Month", monthsBack = 12, className = "" }: MonthPickerProps) {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    months.push({ value: ym, label: lbl });
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-8 text-xs w-48 ${className}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {months.map((m) => (
          <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
