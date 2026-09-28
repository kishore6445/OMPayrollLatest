import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Briefcase, Search, ChevronLeft, ChevronRight, Plus } from "lucide-react";
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

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface Company { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }
interface Client {
  clientcode: number;
  Clientname: string;
  VatNo: string | null;
  PANNo: string | null;
  des: string | null;
  compid: number | null;
  comname: string | null;
}
interface ClientsResponse { data: Client[]; total: number; page: number; pageSize: number; }

export default function ClientsPage() {
  const [search,  setSearch]  = useState("");
  const [compid,  setCompid]  = useState("");
  const [page,    setPage]    = useState(1);
  const [, navigate] = useLocation();
  const pageSize = 50;

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => fetch("/api/scoped/companies", { headers: hdr() }).then((r) => r.json()),
  });

  const { data, isLoading } = useQuery<ClientsResponse>({
    queryKey: ["clients", search, compid, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (compid) params.set("compid", compid);
      return fetch(`/api/clients?${params}`, { headers: hdr() }).then((r) => r.json());
    },
  });

  const rows       = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<Client>[] = [
    {
      key: "clientcode",
      header: "Code",
      className: "w-20 font-mono text-xs text-muted-foreground",
      cell: (r) => String(r.clientcode),
    },
    {
      key: "Clientname",
      header: "Client Name",
      cell: (r) => (
        <Link href={`/clients/${r.clientcode}`} className="font-medium text-primary hover:underline">
          {r.Clientname}
        </Link>
      ),
    },
    {
      key: "comname",
      header: "Company",
      cell: (r) => r.comname
        ? <span className="text-sm">{r.comname}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: "des",   header: "Description", cell: (r) => r.des   ?? "—" },
    {
      key: "PANNo",
      header: "PAN",
      cell: (r) => r.PANNo
        ? <Badge variant="outline" className="font-mono text-xs">{r.PANNo}</Badge>
        : "—",
    },
    {
      key: "actions",
      header: "",
      className: "w-20 text-right",
      cell: (r) => (
        <Link href={`/clients/${r.clientcode}/edit`}>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">Edit</Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <PageHeader
        title="Clients"
        subtitle={`CLIENTMASTER — ${total} records`}
        icon={<Briefcase className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => navigate("/clients/new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Client
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* Company filter */}
        <Select
          value={compid}
          onValueChange={(v) => { setCompid(v === "_all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.compid} value={String(c.compid)}>
                {c.displayLabel ?? `${c.comname} — ID ${c.compid}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Name search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by client name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No clients found."
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
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
