/**
 * Client Detail page
 * Route: /clients/:clientcode
 * Data: GET /api/clients/:clientcode → CLIENTMASTER + COMPANYMAST + UNITMASTER
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Briefcase, Building2, FileText, CreditCard, MapPin,
  Edit, ArrowLeft, Loader2, AlertCircle, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface Unit {
  unitcode: string;
  Unitname: string;
  StateID: string | null;
  city: string | null;
  state: string | null;
  unittype: string | null;
  contractdate: string | null;
  terminatedate: string | null;
}

interface ClientDetail {
  clientcode: number;
  Clientname: string;
  VatNo: string | null;
  PANNo: string | null;
  des: string | null;
  compid: number | null;
  comname: string | null;
  compCity: string | null;
  compState: string | null;
  units: Unit[];
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? <span className="text-muted-foreground font-normal">—</span>}</p>
    </div>
  );
}

interface Props { params?: { clientcode?: string } }

export default function ClientDetailPage({ params }: Props) {
  const clientcode = parseInt(params?.clientcode ?? "", 10);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<ClientDetail>({
    queryKey: ["client", clientcode],
    queryFn: () =>
      fetch(`/api/clients/${clientcode}`, { headers: hdr() }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    enabled: !isNaN(clientcode),
  });

  const deleteClient = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/clients/${clientcode}`, { method: "DELETE", headers: hdr() });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Delete failed (${r.status})`);
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client deleted", description: "The client and its empty site configuration were removed." });
      navigate("/clients");
    },
    onError: (e: Error) => toast({ title: "Cannot delete client", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" /> Client not found.
      </div>
    );
  }

  const units = data.units ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title={data.Clientname}
        subtitle={`CLIENTMASTER — clientcode ${data.clientcode}`}
        icon={<Briefcase className="h-5 w-5" />}
        back="/clients"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate(`/clients/${clientcode}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <ConfirmDialog
              trigger={<Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>}
              title="Delete client?"
              description="This is permanent. If any employee is assigned to this client, deletion will be blocked automatically."
              confirmLabel={deleteClient.isPending ? "Deleting…" : "Delete client"}
              variant="destructive"
              onConfirm={() => deleteClient.mutate()}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Client Name"  value={data.Clientname} />
            </div>
            <Field label="Client Code"   value={data.clientcode} />
            <Field label="Description"   value={data.des} />
          </CardContent>
        </Card>

        {/* Statutory */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Statutory
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">PAN</p>
              {data.PANNo
                ? <Badge variant="outline" className="font-mono text-xs mt-1">{data.PANNo}</Badge>
                : <p className="text-sm text-muted-foreground">—</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">VAT No</p>
              {data.VatNo
                ? <Badge variant="outline" className="font-mono text-xs mt-1">{data.VatNo}</Badge>
                : <p className="text-sm text-muted-foreground">—</p>}
            </div>
          </CardContent>
        </Card>

        {/* Parent Company */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Parent Company
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Field label="Company ID"    value={data.compid ?? "—"} />
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Company Name</p>
              {data.comname ? (
                <Link href={`/company/${data.compid}`} className="text-sm font-medium text-primary hover:underline">
                  {data.comname}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sites / Units */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Sites (UNITMASTER)
            <Badge variant="secondary" className="ml-auto">{units.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {units.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No sites linked to this client.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Unit Code</TableHead>
                  <TableHead className="text-xs">Site Name</TableHead>
                  <TableHead className="text-xs">State</TableHead>
                  <TableHead className="text-xs">City</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Contract Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.unitcode}>
                    <TableCell className="font-mono text-xs">{u.unitcode}</TableCell>
                    <TableCell className="text-sm font-medium">{u.Unitname}</TableCell>
                    <TableCell className="text-xs">{u.StateID ?? "—"}</TableCell>
                    <TableCell className="text-xs">{u.city    ?? "—"}</TableCell>
                    <TableCell className="text-xs">{u.unittype ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {u.contractdate
                        ? new Date(u.contractdate).toLocaleDateString("en-IN")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Clients
        </Button>
      </div>
    </div>
  );
}
