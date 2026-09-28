/**
 * employees/index.tsx — EMPMAST Employee List
 *
 * Fetches from GET /api/employees with full filter set:
 * company, client, unit, branch, status, free-text search.
 * "Add Employee" button navigates to /employees/new.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users, Search, ChevronLeft, ChevronRight, Filter, PlusCircle,
} from "lucide-react";
import { PageHeader }  from "@/components/ui/page-header";
import { Input }       from "@/components/ui/input";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface Employee {
  EmpCode:     string;
  EmpName:     string;
  compid:      number | null;
  clientcode:  number | null;
  unitcode:    string | null;
  branchcode:  number | null;
  workstatus:  string | null;
  designation: string | null;
  deptcode:    string | null;
  GradeCode:   number | null;
  DOJ:         string | null;
  basic:       number | string | null;
  MobNo:       string | null;
  Clientname:  string | null;
  Unitname:    string | null;
  DESINAME:    string | null;
  Deptname:    string | null;
  GradeName:   string | null;
  BranchName:  string | null;
  comname:     string | null;
}

interface EmployeesResponse {
  data:     Employee[];
  total:    number;
  page:     number;
  pageSize: number;
}

const STATUS_STYLE: Record<string, string> = {
  A:          "bg-green-50 text-green-700 border-green-200",
  Active:     "bg-green-50 text-green-700 border-green-200",
  I:          "bg-slate-50 text-slate-600 border-slate-200",
  Inactive:   "bg-slate-50 text-slate-600 border-slate-200",
  L:          "bg-orange-50 text-orange-700 border-orange-200",
  Left:       "bg-orange-50 text-orange-700 border-orange-200",
  S:          "bg-blue-50 text-blue-700 border-blue-200",
  Suspended:  "bg-blue-50 text-blue-700 border-blue-200",
  T:          "bg-red-50 text-red-700 border-red-200",
  Terminated: "bg-red-50 text-red-700 border-red-200",
};

function statusBadge(status: string | null) {
  const k   = status ?? "—";
  const cls = STATUS_STYLE[k] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`text-xs ${cls}`}>{k}</Badge>
  );
}

export default function EmployeesPage() {
  const [search,     setSearch]     = useState("");
  const [compid,     setCompid]     = useState("");
  const [clientcode, setClientcode] = useState("");
  const [unitcode,   setUnitcode]   = useState("");
  const [branchcode, setBranchcode] = useState("");
  const [workstatus, setWorkstatus] = useState("");
  const [page,       setPage]       = useState(1);
  const pageSize = 50;

  // ── Lookup lists ────────────────────────────────────────────────────────────
  const { data: companyList = [] } = useQuery<{ compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string }[]>({
    queryKey: ["companies-slim"],
    queryFn:  () =>
      fetch("/api/company?pageSize=200", { headers: hdr() })
        .then((r) => r.json()).then((d) => d.data ?? []),
    staleTime: 300_000,
  });

  const { data: clientList = [] } = useQuery<{ clientcode: number; Clientname: string }[]>({
    queryKey: ["clients-slim", compid],
    queryFn:  () =>
      fetch(`/api/clients?pageSize=500${compid ? `&compid=${compid}` : ""}`, { headers: hdr() })
        .then((r) => r.json()).then((d) => d.data ?? []),
    staleTime: 120_000,
  });

  const { data: unitList = [] } = useQuery<{ unitcode: string; Unitname: string }[]>({
    queryKey: ["units-slim", compid, clientcode],
    queryFn:  () => {
      const qs = new URLSearchParams({ pageSize: "500" });
      if (compid)     qs.set("compcode",   compid);
      if (clientcode) qs.set("clientcode", clientcode);
      return fetch(`/api/units?${qs}`, { headers: hdr() })
        .then((r) => r.json()).then((d) => d.data ?? []);
    },
    staleTime: 120_000,
  });

  const { data: branchList = [] } = useQuery<{ BranchCode: number; BranchName: string }[]>({
    queryKey: ["branches-slim", compid],
    queryFn:  () => {
      const qs = new URLSearchParams({ pageSize: "200" });
      if (compid) qs.set("compid", compid);
      return fetch(`/api/branches?${qs}`, { headers: hdr() })
        .then((r) => r.json()).then((d) => d.data ?? []);
    },
    staleTime: 120_000,
  });

  // ── Employee count strip ─────────────────────────────────────────────────────
  const { data: counts } = useQuery<Record<string, number>>({
    queryKey: ["employees-counts", compid, clientcode],
    queryFn:  () => {
      const qs = new URLSearchParams();
      if (compid)     qs.set("compid",     compid);
      if (clientcode) qs.set("clientcode", clientcode);
      return fetch(`/api/workers/counts${qs.toString() ? `?${qs}` : ""}`, { headers: hdr() })
        .then((r) => r.json());
    },
  });

  // ── Employee list ────────────────────────────────────────────────────────────
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search)     params.set("search",     search);
  if (compid)     params.set("compid",     compid);
  if (clientcode) params.set("clientcode", clientcode);
  if (unitcode)   params.set("unitcode",   unitcode);
  if (branchcode) params.set("branchcode", branchcode);
  if (workstatus) params.set("workstatus", workstatus);

  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["employees", search, compid, clientcode, unitcode, branchcode, workstatus, page],
    queryFn:  () =>
      fetch(`/api/employees?${params}`, { headers: hdr() }).then((r) => r.json()),
  });

  const rows       = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const totalCount = counts?.total ?? 0;

  function clearFilters() {
    setSearch(""); setCompid(""); setClientcode("");
    setUnitcode(""); setBranchcode(""); setWorkstatus(""); setPage(1);
  }
  const hasFilters = !!(search || compid || clientcode || unitcode || branchcode || workstatus);

  const columns: Column<Employee>[] = [
    {
      key: "EmpCode",
      header: "Emp Code",
      className: "w-28 font-mono text-xs",
      cell: (r) => (
        <Link href={`/employees/${encodeURIComponent(r.EmpCode)}`}
              className="font-mono text-primary hover:underline">
          {r.EmpCode}
        </Link>
      ),
    },
    {
      key: "EmpName",
      header: "Name",
      cell: (r) => (
        <Link href={`/employees/${encodeURIComponent(r.EmpCode)}`}
              className="font-medium hover:underline">
          {r.EmpName}
        </Link>
      ),
    },
    { key: "workstatus", header: "Status",      cell: (r) => statusBadge(r.workstatus) },
    { key: "comname",    header: "Company",      cell: (r) => r.comname    ?? "—" },
    { key: "Clientname", header: "Client",       cell: (r) => r.Clientname ?? "—" },
    { key: "Unitname",   header: "Site",         cell: (r) => r.Unitname   ?? "—" },
    { key: "BranchName", header: "Branch",       cell: (r) => r.BranchName ?? "—" },
    { key: "DESINAME",   header: "Designation",  cell: (r) => r.DESINAME   ?? r.designation ?? "—" },
    { key: "Deptname",   header: "Department",   cell: (r) => r.Deptname   ?? r.deptcode ?? "—" },
    {
      key:       "DOJ",
      header:    "Joined",
      cell: (r) => r.DOJ ? new Date(r.DOJ).toLocaleDateString("en-IN") : "—",
    },
    {
      key:       "basic",
      header:    "Basic (₹)",
      className: "text-right",
      cell: (r) =>
        r.basic != null
          ? Number(r.basic).toLocaleString("en-IN", { maximumFractionDigits: 0 })
          : "—",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-full">
      <PageHeader
        title="Employees"
        subtitle={`EMPMAST — ${totalCount.toLocaleString("en-IN")} total`}
        icon={<Users className="h-5 w-5" />}
        actions={
          <Link href="/employees/new">
            <Button size="sm">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Add Employee
            </Button>
          </Link>
        }
      />

      {/* Count strip */}
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

      {/* Filters row 1: search + status */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Code, name or mobile…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select value={workstatus || "_all"}
                onValueChange={(v) => { setWorkstatus(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            <SelectItem value="A">Active (A)</SelectItem>
            <SelectItem value="I">Inactive (I)</SelectItem>
            <SelectItem value="L">Left (L)</SelectItem>
            <SelectItem value="S">Suspended (S)</SelectItem>
            <SelectItem value="T">Terminated (T)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filters row 2: company, client, unit, branch */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={compid || "_all"}
                onValueChange={(v) => {
                  const val = v === "_all" ? "" : v;
                  setCompid(val); setClientcode(""); setUnitcode(""); setBranchcode(""); setPage(1);
                }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All companies</SelectItem>
            {companyList.map((c) => (
              <SelectItem key={c.compid} value={String(c.compid)}>{c.displayLabel ?? `${c.comname} — ID ${c.compid}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={clientcode || "_all"}
                onValueChange={(v) => { setClientcode(v === "_all" ? "" : v); setUnitcode(""); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All clients</SelectItem>
            {clientList.map((c) => (
              <SelectItem key={c.clientcode} value={String(c.clientcode)}>{c.Clientname}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={unitcode || "_all"}
                onValueChange={(v) => { setUnitcode(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All units / sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All units / sites</SelectItem>
            {unitList.map((u) => (
              <SelectItem key={u.unitcode} value={u.unitcode}>{u.Unitname}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={branchcode || "_all"}
                onValueChange={(v) => { setBranchcode(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All branches</SelectItem>
            {branchList.map((b) => (
              <SelectItem key={b.BranchCode} value={String(b.BranchCode)}>{b.BranchName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
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
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString("en-IN")}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
