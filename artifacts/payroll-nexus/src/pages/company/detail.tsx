import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Building2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate text-sm">
        {value ?? <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

interface CompanyDetailProps {
  params: { compid: string };
}

export default function CompanyDetailPage({ params }: CompanyDetailProps) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: co, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["company", params.compid],
    queryFn: () =>
      fetch(`/api/company/${params.compid}`, { headers: hdr() }).then((r) => r.json()),
  });

  const deleteCompany = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/company/${params.compid}`, { method: "DELETE", headers: hdr() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Delete failed (${r.status})`);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Organisation deleted", description: "The empty organisation was removed successfully." });
      navigate("/company");
    },
    onError: (e: Error) => toast({ title: "Cannot delete organisation", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!co || (co as any).error) {
    return <div className="p-6 text-sm text-destructive">Company not found.</div>;
  }

  const s = (k: string) => co[k] as string | null | undefined;
  const n = (k: string) => co[k] as number | null | undefined;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title={`${s("comname") ?? "Company"}${s("corpID")?.trim() ? ` — ${s("corpID")?.trim()}` : ""}`}
        subtitle={`ID: ${n("compid")} · ${s("state") ?? ""}`}
        back="/company"
        icon={<Building2 className="h-5 w-5" />}
        badge={s("GSTINNo") ? <Badge variant="outline">{s("GSTINNo")}</Badge> : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/company/${params.compid}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </Link>
            <ConfirmDialog
              trigger={<Button variant="destructive" size="sm"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>}
              title="Delete organisation?"
              description="This is permanent. Deletion is allowed only when the organisation has no employees, clients, sites or branches."
              confirmLabel={deleteCompany.isPending ? "Deleting…" : "Delete organisation"}
              variant="destructive"
              onConfirm={() => deleteCompany.mutate()}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Identity &amp; Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Company ID"      value={n("compid")} />
            <Field label="Name"            value={s("comname")} />
            <Field label="Nature of Work"  value={s("NatureOfWork")} />
            <Field label="Registration No" value={s("regno")} />
            <Field label="CIN"             value={s("CINNo")} />
            <Field label="Organization Code / Location Code" value={s("corpID") ?? "—"} />
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Address &amp; Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Address"      value={s("address")} />
            <Field label="Reg. Address" value={s("regadd")} />
            <Field label="City"         value={s("city")} />
            <Field label="District"     value={s("district")} />
            <Field label="State"        value={s("state")} />
            <Field label="PIN"          value={s("pinCode")} />
            <Field label="Country"      value={s("country")} />
            <Field label="Phone"        value={s("phone")} />
            <Field label="Mobile"       value={s("mobno")} />
            <Field label="Fax"          value={s("fax")} />
            <Field label="Email"        value={s("email")} />
            <Field label="Website"      value={s("web")} />
            <Field label="Local Office" value={s("Local_Office")} />
            <Field label="Police Stn"   value={s("policestation")} />
          </CardContent>
        </Card>

        {/* Tax identifiers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Statutory Identifiers</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="PAN"               value={s("PAN_no")} />
            <Field label="TAN"               value={s("TAN_no")} />
            <Field label="TIN"               value={s("TIN_NO")} />
            <Field label="GSTIN"             value={s("GSTINNo")} />
            <Field label="COMP GSTIN"        value={s("COMPGSTIN")} />
            <Field label="State Code"        value={s("CompStateCode")} />
            <Field label="Service Tax No"    value={s("StaxNo")} />
            <Field label="VAT No"            value={s("VATNo")} />
            <Field label="ST No"             value={s("STNo")} />
            <Field label="Labour Licence"    value={s("LinNo")} />
            <Field label="Establishment No"  value={s("EstablishmentCode")} />
          </CardContent>
        </Card>

        {/* PF / ESI */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">PF / ESI</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="PF No"         value={s("pfno")} />
            <Field label="PF Code"       value={s("pfcode")} />
            <Field label="PF Sub-Code"   value={s("PFSUbCode")} />
            <Field label="ESI No"        value={s("esino")} />
            <Field label="ESI Code"      value={s("esicode")} />
            <Field label="ESI Sub-Code"  value={s("ESISubCode")} />
          </CardContent>
        </Card>

        {/* Banking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Banking</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Bank"        value={s("BankName")} />
            <Field label="Account No"  value={s("acno")} />
            <Field label="IFSC"        value={s("BankIFSCCode")} />
            <Field label="Bank Code"   value={s("bankcode")} />
          </CardContent>
        </Card>

        {/* Billing & config */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Billing &amp; Prefixes</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Bill Prefix"         value={s("billprefix")} />
            <Field label="New Bill Prefix"     value={s("NewBillPrefix")} />
            <Field label="Offer Letter Prefix" value={s("offerletterprefix")} />
            <Field label="Voucher Prefix"      value={s("VoucherPreFix")} />
            <Field label="KSpl Rate"           value={s("KSplRate")} />
            <Field label="KCrpt Rate"          value={s("KCrptRate")} />
            <Field label="Dollar Rate"         value={s("MonthlyDollarRate")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
