/**
 * Client Master — List page (stored in UNITMASTER)
 *
 * Source table: UNITMASTER (payrollom_client)
 * Filters: company, zone, free-text search
 * Pagination: server-side
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Plus, Search, Eye, Upload, Download, FileSpreadsheet, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { DataTable }  from "@/components/ui/data-table";
import { Badge }      from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

const PAGE_SIZE = 25;

interface Unit {
  unitcode: string;
  Unitname: string;
  StateID: string | null;
  compcode: number | null;
  clientcode: number | null;
  branchcode: number | null;
  zonecode: number | null;
  city: string | null;
  state: string | null;
  contractdate: string | null;
  terminatedate: string | null;
  unittype: string | null;
  Clientname: string | null;
  comname: string | null;
  BranchName: string | null;
  zonename: string | null;
}

interface Company   { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }
interface Zone      { zonecode: number; zonename: string; }

interface ClientImportValidation {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: Array<{ row: number; unitcode: string; clientName: string; error: string }>;
  hasMoreErrors?: boolean;
  note?: string;
}

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export default function UnitsPage() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canWrite = hasPermission("units", "write");
  const canExport = hasPermission("units", "export");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ClientImportValidation | null>(null);
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
      const r = await fetch("/api/units/import/validate", { method: "POST", headers: hdr(), body: fd });
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
      const r = await fetch("/api/units/import", { method: "POST", headers: hdr(), body: fd });
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
      toast({ title: "Clients imported", description: `${d.imported ?? 0} Client(s) added successfully.` });
      window.location.reload();
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    } finally { setCommittingImport(false); }
  }
  const [compcode,   setCompcode]   = useState("");
  const [zonecode,   setZonecode]   = useState("");
  const [search,     setSearch]     = useState("");
  const [draft,      setDraft]      = useState("");
  const [page,       setPage]       = useState(1);

  // Lookups for filters
  const { data: companies } = useQuery({
    queryKey: ["companies-lookup"],
    queryFn: () => apiFetch<Company[]>("/api/scoped/companies"),
  });

  const { data: zonesData } = useQuery({
    queryKey: ["zones-lookup"],
    queryFn: () => apiFetch<{ data: Zone[] }>("/api/zones?pageSize=500"),
  });

  // Main data
  const { data, isLoading, isError } = useQuery({
    queryKey: ["units", compcode, zonecode, search, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (compcode)   params.set("compcode",   compcode);
      if (zonecode)   params.set("zonecode",   zonecode);
      if (search)     params.set("search",     search);
      return apiFetch<{ data: Unit[]; total: number }>(`/api/units?${params}`);
    },
  });

  const rows   = data?.data ?? [];
  const total  = data?.total ?? 0;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSearch() {
    setSearch(draft);
    setPage(1);
  }

  function handleCompany(v: string) {
    setCompcode(v === "__all__" ? "" : v);
    setPage(1);
  }

  function fmt(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
  }

  const columns = [
    { key: "unitcode",   header: "Code" },
    {
      key: "Unitname",
      header: "Client",
      cell: (row: Unit) => (
        <Link href={`/clients/${row.unitcode}`}>
          <span className="font-medium text-primary hover:underline cursor-pointer">
            {row.Unitname}
          </span>
        </Link>
      ),
    },
    { key: "comname",    header: "Company", cell: (row: Unit) => row.comname ?? "—" },
    { key: "zonename",   header: "Zone",    cell: (row: Unit) => row.zonename ?? "—" },
    {
      key: "state",
      header: "Location",
      cell: (row: Unit) =>
        [row.city, row.state].filter(Boolean).join(", ") || "—",
    },
    {
      key: "contractdate",
      header: "Contract",
      cell: (row: Unit) => fmt(row.contractdate),
    },
    {
      key: "terminatedate",
      header: "Status",
      cell: (row: Unit) =>
        row.terminatedate ? (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            {fmt(row.terminatedate)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300">Active</Badge>
        ),
    },
    {
      key: "_actions",
      header: "",
      cell: (row: Unit) => (
        <Link href={`/clients/${row.unitcode}`}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Client Master"
        subtitle={`${total} client record${total !== 1 ? "s" : ""} · stored in UNITMASTER`}
        icon={<MapPin className="h-5 w-5 text-muted-foreground" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void validateImport(f); }} />
                <Button variant="outline" size="sm" onClick={() => void downloadAuthorized("/api/units/import-template.xlsx", "Client_Import_Template.xlsx")}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Template
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" /> Import
                </Button>
              </>
            )}
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => {
                const q = new URLSearchParams(); if (compcode) q.set("compcode", compcode); if (zonecode) q.set("zonecode", zonecode); if (search) q.set("search", search);
                void downloadAuthorized(`/api/units/export.xlsx?${q.toString()}`, "Clients.xlsx");
              }}>
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
            )}
            {canWrite && (
              <Link href="/clients/new">
                <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Client</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        {/* Company */}
        <Select value={compcode || "__all__"} onValueChange={handleCompany}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All companies</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.compid} value={String(c.compid)}>
                {c.displayLabel ?? `${c.comname} — ID ${c.compid}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Zone */}
        <Select
          value={zonecode || "__all__"}
          onValueChange={(v) => { setZonecode(v === "__all__" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All zones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All zones</SelectItem>
            {(zonesData?.data ?? []).map((z) => (
              <SelectItem key={z.zonecode} value={String(z.zonecode)}>
                {z.zonename}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="flex gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by client name or code…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} className="h-8">
          Search
        </Button>
        {search && (
          <Button
            variant="ghost" size="sm" onClick={() => { setSearch(""); setDraft(""); setPage(1); }}
            className="h-8 text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isError ? (
        <p className="text-sm text-destructive">Failed to load clients. Check your permissions.</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="No clients found. Adjust your filters or add a new client."
        />
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)} className="h-7 text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline" size="sm" disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)} className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Validate Client Import</DialogTitle>
            <DialogDescription>Nothing is written to UNITMASTER until every row passes validation and you confirm the import.</DialogDescription>
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
              {importResult.note && <p className="text-xs text-muted-foreground">{importResult.note}</p>}
              {importResult.errors.length > 0 && (
                <div className="max-h-64 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Client</th><th className="text-left p-2">Issue</th></tr></thead>
                    <tbody>{importResult.errors.map((e, i) => <tr key={`${e.row}-${i}`} className="border-t"><td className="p-2">{e.row}</td><td className="p-2">{e.unitcode || "Auto"} · {e.clientName || "—"}</td><td className="p-2 text-destructive">{e.error}</td></tr>)}</tbody>
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
