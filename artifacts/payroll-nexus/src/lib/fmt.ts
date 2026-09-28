export function inr(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function inrFull(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function num(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "0";
  return new Intl.NumberFormat("en-IN").format(n);
}

export function pct(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

export function fmtMonth(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function prevMonth(ym?: string): string {
  const [y, m] = (ym ?? currentMonth()).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
