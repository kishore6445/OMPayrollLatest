/**
 * Branches & Branch Offices page
 *
 * Tabs: Branches | Branch Offices | Zones | Relationships
 * Each tab has a list, company-filter, search, pagination, and CRUD buttons.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery }    from "@tanstack/react-query";
import { MapPin, Building2, Globe, Network, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader }  from "@/components/ui/page-header";
import { Input }       from "@/components/ui/input";
import { Button }      from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Branch {
  BranchCode:  number;
  BranchName:  string;
  Baddress:    string | null;
  BManager:    string | null;
  BPhone:      string | null;
  ESIZonecode: number | null;
  remark:      string | null;
  compid:      number | null;
  comname:     string | null;
}

interface BranchOffice {
  BranchStateID:   number;
  BranchState:     string | null;
  BranchCity:      string | null;
  BranchPincode:   number | null;
  BGSTIN:          string | null;
  BranchPhone:     string | null;
  BranchEmail:     string | null;
  Compid:          number | null;
  comname:         string | null;
}

interface Zone {
  zonecode:    number;
  zonename:    string;
  description: string | null;
  PFRate:      number | null;
  esiSUBCode:  string | null;
  compcode:    string | null;
}

interface Company { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }

// ── Main component ─────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const [, navigate] = useLocation();

  // ── Company filter ─────────────────────────────────────────────────────────
  const [filterCompid, setFilterCompid] = useState<string>("");

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () =>
      fetch("/api/company?pageSize=200", { headers: hdr() })
        .then((r) => r.json())
        .then((d) => d.data ?? d),
  });

  // ── Branch list ────────────────────────────────────────────────────────────
  const [branchSearch, setBranchSearch] = useState("");
  const [branchPage,   setBranchPage]   = useState(1);

  const branchQs = new URLSearchParams({ page: String(branchPage), pageSize: "25" });
  if (filterCompid) branchQs.set("compid", filterCompid);
  if (branchSearch)  branchQs.set("search", branchSearch);

  const { data: branchData, isLoading: branchLoading } = useQuery<{
    data: Branch[]; total: number; page: number; pageSize: number;
  }>({
    queryKey: ["branches", filterCompid, branchSearch, branchPage],
    queryFn:  () =>
      fetch(`/api/branches?${branchQs}`, { headers: hdr() }).then((r) => r.json()),
  });

  // ── Branch-Office list ─────────────────────────────────────────────────────
  const [officeSearch, setOfficeSearch] = useState("");
  const [officePage,   setOfficePage]   = useState(1);

  const officeQs = new URLSearchParams({ page: String(officePage), pageSize: "25" });
  if (filterCompid) officeQs.set("compid", filterCompid);
  if (officeSearch)  officeQs.set("search", officeSearch);

  const { data: officeData, isLoading: officeLoading } = useQuery<{
    data: BranchOffice[]; total: number; page: number; pageSize: number;
  }>({
    queryKey: ["branch-offices", filterCompid, officeSearch, officePage],
    queryFn:  () =>
      fetch(`/api/branch-offices?${officeQs}`, { headers: hdr() }).then((r) => r.json()),
  });

  // ── Zone list ──────────────────────────────────────────────────────────────
  const [zoneSearch, setZoneSearch] = useState("");

  const { data: zones = [], isLoading: zoneLoading } = useQuery<Zone[]>({
    queryKey: ["zones", zoneSearch],
    queryFn:  () =>
      fetch(`/api/zones${zoneSearch ? `?search=${encodeURIComponent(zoneSearch)}` : ""}`, { headers: hdr() })
        .then((r) => r.json()),
  });

  // ── Table columns ──────────────────────────────────────────────────────────

  const branchCols: Column<Branch>[] = [
    {
      key: "BranchCode", header: "Code",
      className: "w-16 font-mono text-xs",
      cell: (r) => String(r.BranchCode),
    },
    { key: "BranchName", header: "Branch Name" },
    {
      key: "comname", header: "Company",
      cell: (r) => r.comname ?? (r.compid ? `#${r.compid}` : "—"),
    },
    { key: "BManager",   header: "Manager",  cell: (r) => r.BManager  ?? "—" },
    { key: "BPhone",     header: "Phone",    cell: (r) => r.BPhone    ?? "—" },
    { key: "ESIZonecode", header: "ESI Zone", cell: (r) => r.ESIZonecode != null ? String(r.ESIZonecode) : "—" },
  ];

  const officeCols: Column<BranchOffice>[] = [
    {
      key: "BranchStateID", header: "ID",
      className: "w-12 font-mono text-xs",
      cell: (r) => String(r.BranchStateID),
    },
    { key: "BranchState", header: "State",   cell: (r) => r.BranchState ?? "—" },
    { key: "BranchCity",  header: "City",    cell: (r) => r.BranchCity  ?? "—" },
    {
      key: "comname", header: "Company",
      cell: (r) => r.comname ?? (r.Compid ? `#${r.Compid}` : "—"),
    },
    { key: "BGSTIN",      header: "GSTIN",   cell: (r) => r.BGSTIN      ?? "—" },
    { key: "BranchPhone", header: "Phone",   cell: (r) => r.BranchPhone ?? "—" },
  ];

  const zoneCols: Column<Zone>[] = [
    {
      key: "zonecode", header: "Code",
      className: "w-16 font-mono text-xs",
      cell: (r) => String(r.zonecode),
    },
    { key: "zonename",    header: "Zone Name" },
    { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
    { key: "PFRate",      header: "PF Rate",      cell: (r) => r.PFRate != null ? `${r.PFRate}%` : "—" },
    { key: "esiSUBCode",  header: "ESI Sub-Code", cell: (r) => r.esiSUBCode ?? "—" },
  ];

  // ── Pagination helpers ─────────────────────────────────────────────────────

  function Pager({
    total, page, pageSize, onPage,
  }: {
    total: number; page: number; pageSize: number; onPage: (p: number) => void;
  }) {
    const last = Math.ceil(total / pageSize);
    if (last <= 1) return null;
    return (
      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {last} ({total} total)
        </span>
        <Button size="sm" variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <PageHeader
        title="Branches &amp; Offices"
        subtitle="BRANCH · BRANCHOFFICE · ZONE_MASTER"
        icon={<MapPin className="h-5 w-5" />}
      />

      {/* Global company filter */}
      <div className="max-w-xs">
        <Select value={filterCompid} onValueChange={(v) => { setFilterCompid(v === "_all" ? "" : v); setBranchPage(1); setOfficePage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.compid} value={String(c.compid)}>{c.displayLabel ?? `${c.comname} — ID ${c.compid}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches">
            <MapPin className="mr-1.5 h-3.5 w-3.5" /> Branches
          </TabsTrigger>
          <TabsTrigger value="offices">
            <Building2 className="mr-1.5 h-3.5 w-3.5" /> Branch Offices
          </TabsTrigger>
          <TabsTrigger value="zones">
            <Globe className="mr-1.5 h-3.5 w-3.5" /> Zones
          </TabsTrigger>
          <TabsTrigger value="relationships">
            <Network className="mr-1.5 h-3.5 w-3.5" /> Relationships
          </TabsTrigger>
        </TabsList>

        {/* ── Branches ── */}
        <TabsContent value="branches" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Input
              className="max-w-sm"
              placeholder="Search by branch name…"
              value={branchSearch}
              onChange={(e) => { setBranchSearch(e.target.value); setBranchPage(1); }}
            />
            <Button size="sm" onClick={() => navigate("/branches/new")}>
              <Plus className="mr-2 h-4 w-4" /> New Branch
            </Button>
          </div>

          <DataTable
            columns={branchCols}
            data={branchData?.data ?? []}
            isLoading={branchLoading}
            emptyMessage="No branches found."
            onRowClick={(row) => navigate(`/branches/${row.compid}/${row.BranchCode}`)}
          />

          <Pager
            total={branchData?.total ?? 0}
            page={branchPage}
            pageSize={25}
            onPage={setBranchPage}
          />
        </TabsContent>

        {/* ── Branch Offices ── */}
        <TabsContent value="offices" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Input
              className="max-w-sm"
              placeholder="Search by state or city…"
              value={officeSearch}
              onChange={(e) => { setOfficeSearch(e.target.value); setOfficePage(1); }}
            />
            <Button size="sm" onClick={() => navigate("/branch-offices/new")}>
              <Plus className="mr-2 h-4 w-4" /> New Branch Office
            </Button>
          </div>

          <DataTable
            columns={officeCols}
            data={officeData?.data ?? []}
            isLoading={officeLoading}
            emptyMessage="No branch offices found."
            onRowClick={(row) => navigate(`/branch-offices/${row.Compid}/${row.BranchStateID}`)}
          />

          <Pager
            total={officeData?.total ?? 0}
            page={officePage}
            pageSize={25}
            onPage={setOfficePage}
          />
        </TabsContent>

        {/* ── Zones ── */}
        <TabsContent value="zones" className="space-y-4 pt-4">
          <Input
            className="max-w-sm"
            placeholder="Search by zone name…"
            value={zoneSearch}
            onChange={(e) => setZoneSearch(e.target.value)}
          />
          <DataTable
            columns={zoneCols}
            data={zones}
            isLoading={zoneLoading}
            emptyMessage="No zones found."
          />
        </TabsContent>

        {/* ── Relationships ── */}
        <TabsContent value="relationships" className="space-y-4 pt-4">
          <div className="rounded-lg border bg-card p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" /> BRANCH → COMPANYMAST
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Each branch belongs to one company via <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">BRANCH.compid → COMPANYMAST.compid</code>.
                BranchCode is unique <strong>within</strong> each company (not globally).
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Company</th>
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Branches</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 && (
                    <tr><td colSpan={2} className="text-muted-foreground py-2">No companies</td></tr>
                  )}
                  {companies.map((c) => {
                    const count = (branchData?.data ?? []).filter((b) => b.compid === c.compid).length;
                    return (
                      <tr key={c.compid} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 font-medium">{c.comname}</td>
                        <td className="py-1.5 text-muted-foreground">{count} branch{count !== 1 ? "es" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" /> BRANCHOFFICE → COMPANYMAST
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Each branch office is the company's registered GST/statutory office in a state.
                Linked via <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">BRANCHOFFICE.Compid → COMPANYMAST.compid</code>.
                BranchStateID is unique <strong>within</strong> each company.
                BRANCHOFFICE has <strong>no direct FK to BRANCH</strong>.
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Company</th>
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Branch Offices</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 && (
                    <tr><td colSpan={2} className="text-muted-foreground py-2">No companies</td></tr>
                  )}
                  {companies.map((c) => {
                    const count = (officeData?.data ?? []).filter((o) => o.Compid === c.compid).length;
                    return (
                      <tr key={c.compid} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 font-medium">{c.comname}</td>
                        <td className="py-1.5 text-muted-foreground">{count} office{count !== 1 ? "s" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
