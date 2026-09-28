import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Building2, Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

interface Company {
  compid: number;
  comname: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pfno: string | null;
  esino: string | null;
  GSTINNo: string | null;
  PAN_no: string | null;
  corpID: string | null;
}

export default function CompanyListPage() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  const { data = [], isLoading } = useQuery<Company[]>({
    queryKey: ["companies", search],
    queryFn: () =>
      fetch(
        `/api/company${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        { headers: hdr() }
      ).then((r) => r.json()),
  });

  const columns: Column<Company>[] = [
    {
      key: "compid",
      header: "ID",
      className: "w-16 text-muted-foreground font-mono text-xs",
      cell: (r) => String(r.compid),
    },
    {
      key: "comname",
      header: "Company Name",
      cell: (r) => (
        <Link href={`/company/${r.compid}`} className="font-medium text-primary hover:underline">
          {r.comname}{r.corpID?.trim() ? ` — ${r.corpID.trim()}` : ""}
        </Link>
      ),
    },
    { key: "city",  header: "City",  cell: (r) => r.city  ?? "—" },
    { key: "state", header: "State", cell: (r) => r.state ?? "—" },
    { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—" },
    {
      key: "pfno",
      header: "PF No",
      cell: (r) =>
        r.pfno ? (
          <Badge variant="outline" className="font-mono text-xs">{r.pfno}</Badge>
        ) : "—",
    },
    {
      key: "esino",
      header: "ESI No",
      cell: (r) =>
        r.esino ? (
          <Badge variant="outline" className="font-mono text-xs">{r.esino}</Badge>
        ) : "—",
    },
    {
      key: "GSTINNo",
      header: "GSTIN",
      cell: (r) => r.GSTINNo ?? "—",
    },
    {
      key: "actions",
      header: "",
      className: "w-20 text-right",
      cell: (r) => (
        <Link href={`/company/${r.compid}/edit`}>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            Edit
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <PageHeader
        title="Companies"
        subtitle="COMPANYMAST — company master records"
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Button onClick={() => navigate("/company/new")} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            New Company
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by company name / org code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyMessage="No companies found."
      />
    </div>
  );
}
