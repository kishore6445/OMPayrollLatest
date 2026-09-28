import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapPin, Search, ChevronLeft, ChevronRight } from "lucide-react";
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

interface Site {
  unitcode: string;
  Unitname: string;
  clientcode: number | null;
  Clientname: string | null;
  StateID: string | null;
  city: string | null;
  contractdate: string | null;
  terminatedate: string | null;
  unittype: string | null;
  workerCount?: number;
}

interface SitesResponse {
  data: Site[];
  total: number;
  page: number;
  pageSize: number;
}

export default function SitesPage() {
  const [search, setSearch]         = useState("");
  const [clientcode, setClientcode] = useState("");
  const [page, setPage]             = useState(1);
  const pageSize = 50;

  // Client dropdown
  const { data: clientList = [] } = useQuery<{ clientcode: number; Clientname: string }[]>({
    queryKey: ["clients-slim"],
    queryFn: () =>
      fetch("/api/clients?pageSize=500", { headers: hdr() })
        .then((r) => r.json())
        .then((d) => d.data ?? []),
    staleTime: 300_000,
  });

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search)     params.set("search",     search);
  if (clientcode) params.set("clientcode", clientcode);

  const { data, isLoading } = useQuery<SitesResponse>({
    queryKey: ["sites", search, clientcode, page],
    queryFn: () =>
      fetch(`/api/sites?${params}`, { headers: hdr() }).then((r) => r.json()),
  });

  const rows       = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<Site>[] = [
    {
      key: "unitcode",
      header: "Code",
      className: "w-24 font-mono text-xs text-muted-foreground",
    },
    {
      key: "Unitname",
      header: "Site / Unit",
      cell: (r) => (
        <Link href={`/sites/${r.unitcode}`} className="font-medium text-primary hover:underline">
          {r.Unitname}
        </Link>
      ),
    },
    {
      key: "Clientname",
      header: "Client",
      cell: (r) =>
        r.Clientname ? (
          <Link
            href={`/clients/${r.clientcode}`}
            className="text-muted-foreground hover:text-foreground hover:underline text-sm"
          >
            {r.Clientname}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "StateID",  header: "State",      cell: (r) => r.StateID  ?? "—" },
    { key: "city",     header: "City",       cell: (r) => r.city     ?? "—" },
    { key: "unittype", header: "Type",       cell: (r) => r.unittype ?? "—" },
    {
      key: "contractdate",
      header: "Contract Start",
      cell: (r) =>
        r.contractdate ? new Date(r.contractdate).toLocaleDateString("en-IN") : "—",
    },
    {
      key: "terminatedate",
      header: "Status",
      cell: (r) =>
        r.terminatedate ? (
          <Badge variant="secondary" className="text-xs">
            Terminated {new Date(r.terminatedate).toLocaleDateString("en-IN")}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
            Active
          </Badge>
        ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <PageHeader
        title="Sites"
        subtitle={`UNITMASTER — ${total} records`}
        icon={<MapPin className="h-5 w-5" />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by site name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select value={clientcode || "_all"} onValueChange={(v) => { setClientcode(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All clients</SelectItem>
            {clientList.map((c) => (
              <SelectItem key={c.clientcode} value={String(c.clientcode)}>
                {c.Clientname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No sites found."
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
    </div>
  );
}
