import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Users, Search, ChevronLeft, ChevronRight, Filter, UserPlus, Upload, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface Worker {
  EmpCode: string;
  EmpName: string;
  workstatus: string | null;
  clientcode: number | null;
  unitcode: string | null;
  designation: string | null;
  deptcode: string | null;
  GradeCode: number | null;
  DOJ: string | null;
  basic: number | string | null;
  Clientname: string | null;
  Unitname: string | null;
  DESINAME: string | null;
  Deptname: string | null;
  GradeName: string | null;
  Sex: string | null;
}

interface WorkersResponse {
  data: Worker[];
  total: number;
  page: number;
  pageSize: number;
}

interface CountsResponse {
  total?: number;
  active?: number;
  inactive?: number;
  [key: string]: number | undefined;
}

interface ImportValidation {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: Array<{ row: number; empCode: string; error: string }>;
  hasMoreErrors?: boolean;
  note?: string;
}

const STATUS_STYLES: Record<string, string> = {
  A: "bg-green-50 text-green-700 border-green-200",
  Active: "bg-green-50 text-green-700 border-green-200",
  I: "bg-slate-50 text-slate-600 border-slate-200",
  Inactive: "bg-slate-50 text-slate-600 border-slate-200",
  L: "bg-yellow-50 text-yellow-700 border-yellow-200",  // Left
  S: "bg-blue-50 text-blue-700 border-blue-200",         // Suspended
};

function statusBadge(status: string | null) {
  const k = status ?? "—";
  const cls = STATUS_STYLES[k] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`text-xs ${cls}`}>
      {k}
    </Badge>
  );
}

export default function WorkersPage() {
  const [search, setSearch]         = useState("");
  const [workstatus, setWorkstatus] = useState("");
  const [unitcode, setUnitcode] = useState("");
  const [page, setPage]             = useState(1);
  const pageSize = 50;
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canWrite = hasPermission("workers", "write");
  const canExport = hasPermission("workers", "export");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportValidation | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [validatingImport, setValidatingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);

  async function downloadAuthorized(url: string, fallbackName: string) {
    try {
      const r = await fetch(url, { headers: hdr() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? `Download failed (${r.status})`); }
      const blob = await r.blob();
      const cd = r.headers.get("content-disposition") ?? "";
      const filename = cd.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackName;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    }
  }

  async function validateImport(file: File) {
    setValidatingImport(true); setImportResult(null); setImportFile(file); setImportOpen(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/workers/import/validate", { method: "POST", headers: hdr(), body: fd });
      const contentType = r.headers.get("content-type") ?? "";
      const raw = await r.text();
      let d: any = {};
      if (contentType.includes("application/json")) {
        try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      }
      if (!r.ok) {
        const fallback = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(d?.error ?? d?.message ?? fallback ?? `Import validation failed (${r.status})`);
      }
      if (!contentType.includes("application/json")) {
        throw new Error(`Import API returned an unexpected response (${r.status}). Restart both API and web servers and try again.`);
      }
      setImportResult(d);
    } catch (err) {
      setImportOpen(false);
      toast({ title: "Import validation failed", description: err instanceof Error ? err.message : "Please check the Excel file", variant: "destructive" });
    } finally { setValidatingImport(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function commitImport() {
    if (!importFile || !importResult || importResult.errorCount > 0) return;
    setCommittingImport(true);
    try {
      const fd = new FormData(); fd.append("file", importFile);
      const r = await fetch("/api/workers/import", { method: "POST", headers: hdr(), body: fd });
      const contentType = r.headers.get("content-type") ?? "";
      const raw = await r.text();
      let d: any = {};
      if (contentType.includes("application/json")) {
        try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      }
      if (!r.ok) {
        const fallback = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(d?.error ?? d?.message ?? fallback ?? `Import failed (${r.status})`);
      }
      if (!contentType.includes("application/json")) {
        throw new Error(`Import API returned an unexpected response (${r.status}). Restart both API and web servers and try again.`);
      }
      setImportOpen(false); setImportFile(null); setImportResult(null); setPage(1);
      toast({ title: "Employees imported", description: `${d.imported ?? 0} employee(s) added. Aadhaar/UAN/ESIC verification remains pending.` });
      window.location.reload();
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    } finally { setCommittingImport(false); }
  }

  const { data: clientList = [] } = useQuery<{ unitcode: string; Unitname: string }[]>({
    queryKey: ["clients-unitmaster-slim"],
    queryFn: () =>
      fetch("/api/scoped/units", { headers: hdr() })
        .then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: counts } = useQuery<CountsResponse>({
    queryKey: ["workers-counts", unitcode],
    queryFn: () =>
      fetch(
        `/api/workers/counts${unitcode ? `?unitcode=${encodeURIComponent(unitcode)}` : ""}`,
        { headers: hdr() }
      ).then((r) => r.json()),
  });

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search)     params.set("search",     search);
  if (workstatus) params.set("workstatus", workstatus);
  if (unitcode) params.set("unitcode", unitcode);

  const { data, isLoading } = useQuery<WorkersResponse>({
    queryKey: ["workers", search, workstatus, unitcode, page],
    queryFn: () =>
      fetch(`/api/workers?${params}`, { headers: hdr() }).then((r) => r.json()),
  });

  const rows       = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<Worker>[] = [
    {
      key: "EmpCode",
      header: "Emp Code",
      className: "w-28 font-mono text-xs",
      cell: (r) => (
        <Link
          href={`/workers/${encodeURIComponent(r.EmpCode)}`}
          className="font-mono text-primary hover:underline"
        >
          {r.EmpCode}
        </Link>
      ),
    },
    {
      key: "EmpName",
      header: "Name",
      cell: (r) => (
        <Link
          href={`/workers/${encodeURIComponent(r.EmpCode)}`}
          className="font-medium hover:underline"
        >
          {r.EmpName}
        </Link>
      ),
    },
    { key: "workstatus", header: "Status",      cell: (r) => statusBadge(r.workstatus) },
    { key: "Unitname",   header: "Client",       cell: (r) => r.Unitname   ?? "—" },
    { key: "DESINAME",   header: "Designation",  cell: (r) => r.DESINAME   ?? r.designation ?? "—" },
    { key: "Deptname",   header: "Department",   cell: (r) => r.Deptname   ?? r.deptcode ?? "—" },
    { key: "GradeName",  header: "Grade",        cell: (r) => r.GradeName  ?? (r.GradeCode != null ? String(r.GradeCode) : "—") },
    {
      key: "DOJ",
      header: "Date Joined",
      cell: (r) => r.DOJ ? new Date(r.DOJ).toLocaleDateString("en-IN") : "—",
    },
    {
      key: "basic",
      header: "Basic (₹)",
      className: "text-right",
      cell: (r) =>
        r.basic != null
          ? Number(r.basic).toLocaleString("en-IN", { maximumFractionDigits: 0 })
          : "—",
    },
  ];

  const totalWorkers = counts?.total ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Employees"
          subtitle={`EMPMAST — ${totalWorkers.toLocaleString("en-IN")} workers`}
          icon={<Users className="h-5 w-5" />}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWrite && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void validateImport(f); }}
              />
              <Button variant="outline" onClick={() => void downloadAuthorized("/api/workers/import-template.xlsx", "Employee_Import_Template.xlsx")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Template
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Import
              </Button>
            </>
          )}
          {canExport && (
            <Button variant="outline" onClick={() => {
              const q = new URLSearchParams();
              if (search) q.set("search", search); if (workstatus) q.set("workstatus", workstatus); if (unitcode) q.set("unitcode", unitcode);
              void downloadAuthorized(`/api/workers/export.xlsx?${q.toString()}`, "Employees.xlsx");
            }}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
          {canWrite && (
            <Button asChild>
              <Link href="/workers/new">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Employee
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Counts strip */}
      {counts && (
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="rounded-full bg-muted px-3 py-0.5">
              <span className="font-medium text-foreground">{k}:</span>{" "}
              {(v ?? 0).toLocaleString("en-IN")}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by code or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select
          value={unitcode || "_all"}
          onValueChange={(v) => { setUnitcode(v === "_all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All clients</SelectItem>
            {clientList.map((c) => (
              <SelectItem key={c.unitcode} value={c.unitcode}>
                {c.Unitname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={workstatus || "_all"}
          onValueChange={(v) => { setWorkstatus(v === "_all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            <SelectItem value="A">Active (A)</SelectItem>
            <SelectItem value="I">Inactive (I)</SelectItem>
            <SelectItem value="L">Left (L)</SelectItem>
            <SelectItem value="S">Suspended (S)</SelectItem>
          </SelectContent>
        </Select>

        {(search || workstatus || unitcode) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setWorkstatus(""); setUnitcode(""); setPage(1); }}
          >
            <Filter className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No employees found."
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Validate Employee Import</DialogTitle>
            <DialogDescription>Nothing is written to EMPMAST until validation passes and you confirm the import.</DialogDescription>
          </DialogHeader>
          {validatingImport ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validating Excel file…</div>
          ) : importResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3"><div className="text-muted-foreground">Rows</div><div className="text-xl font-semibold">{importResult.totalRows}</div></div>
                <div className="rounded border p-3"><div className="text-muted-foreground">Valid</div><div className="text-xl font-semibold text-emerald-700">{importResult.validCount}</div></div>
                <div className="rounded border p-3"><div className="text-muted-foreground">Errors</div><div className="text-xl font-semibold text-destructive">{importResult.errorCount}</div></div>
              </div>
              <p className="text-xs text-muted-foreground">{importResult.note}</p>
              {importResult.errors.length > 0 && (
                <div className="max-h-64 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Employee</th><th className="text-left p-2">Issue</th></tr></thead>
                    <tbody>{importResult.errors.map((e, i) => <tr key={`${e.row}-${i}`} className="border-t"><td className="p-2">{e.row}</td><td className="p-2 font-mono">{e.empCode || "—"}</td><td className="p-2 text-destructive">{e.error}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {importResult.hasMoreErrors && <p className="text-xs text-muted-foreground">Only the first 500 errors are shown.</p>}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button disabled={!importResult || importResult.errorCount > 0 || committingImport || validatingImport} onClick={() => void commitImport()}>
              {committingImport ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : <>Confirm Import</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
