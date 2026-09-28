/**
 * Client Master — Detail page (stored in UNITMASTER)
 *
 * Source table: UNITMASTER (payrollom_client)
 * Shows identity, relationships, address, contract, and key config fields.
 * Advanced legacy fields (chkESIHead*, chkLWFHead*, etc.) are hidden.
 */

import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, ArrowLeft, Edit, Building2, Globe,
  Phone, Mail, CalendarDays, Clock, FileText, Trash2,
} from "lucide-react";
import { PageHeader }  from "@/components/ui/page-header";
import { Button }      from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge }       from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";

interface Props { params: { unitcode: string } }

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm gap-4">
      <span className="text-muted-foreground shrink-0 w-44">{label}</span>
      <span className="text-right font-medium break-all">{value ?? "—"}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" });
}

export default function UnitDetailPage({ params }: Props) {
  const { unitcode } = params;
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: unit, isLoading, isError } = useQuery({
    queryKey: ["unit", unitcode],
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/units/${unitcode}`),
    enabled: !!unitcode,
  });


  const deleteClient = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/units/${encodeURIComponent(unitcode)}`, {
        method: "DELETE",
        headers: hdr(),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Delete failed (${r.status})`);
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["units"] });
      toast({ title: "Client deleted", description: "The client was deleted successfully." });
      navigate("/units");
    },
    onError: (e: Error) => {
      toast({ title: "Cannot delete client", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading unit…
      </div>
    );
  }

  if (isError || !unit) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive mb-3">Unit not found or you do not have access.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/units")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
        </Button>
      </div>
    );
  }

  const s = (k: string) => unit[k] as string | null | undefined;
  const n = (k: string) => unit[k] as number | null | undefined;
  const contractActive = !unit.terminatedate;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={String(unit.Unitname ?? unitcode)}
        subtitle={`Unit code: ${unitcode}`}
        icon={<MapPin className="h-5 w-5 text-muted-foreground" />}
        actions={
          <div className="flex items-center gap-2">
            {contractActive ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-300">Terminated</Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/units")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
            <Link href={`/clients/${unitcode}/edit`}>
              <Button size="sm" className="gap-1.5">
                <Edit className="h-3.5 w-3.5" /> Edit
              </Button>
            </Link>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              }
              title="Delete client?"
              description="This is permanent. If any employee is assigned to this client, deletion will be blocked automatically."
              confirmLabel={deleteClient.isPending ? "Deleting…" : "Delete client"}
              variant="destructive"
              onConfirm={() => deleteClient.mutate()}
            />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Identity */}
        <SectionCard icon={MapPin} title="General Information">
          <Row label="Client Code"    value={unitcode} />
          <Row label="Client Name"    value={s("Unitname")} />
          <Row label="State ID"     value={s("StateID")} />
          <Row label="Location"     value={s("unitlocation")} />
          <Row label="Client Type"    value={s("unittype")} />
          <Row label="Category"     value={s("category")} />
          <Row label="Manager"      value={s("unitmanager")} />
        </SectionCard>

        {/* Relationships */}
        <SectionCard icon={Building2} title="Company / Entity">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm py-1.5 border-b border-border/40">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-24 shrink-0">Company</span>
              {unit.comname ? (
                <Link href={`/company/${unit.compcode}`}>
                  <span className="font-medium text-primary hover:underline cursor-pointer">
                    {String(unit.comname)}
                  </span>
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm py-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-24 shrink-0">Zone</span>
              <span className="font-medium">{s("zonename") ?? "—"}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40">
            <Row label="Zone Group"   value={s("zonegroup")} />
            <Row label="Billing Zone" value={n("BillingZone") ?? null} />
            <Row label="Segment Code" value={n("segcode") ?? null} />
          </div>
        </SectionCard>

        {/* Address & Contact */}
        <SectionCard icon={Phone} title="Address & Contact">
          <Row label="Address"   value={s("address")} />
          <Row label="City"      value={s("city")} />
          <Row label="State"     value={s("state")} />
          <Row label="PIN Code"  value={s("pincode")} />
          <Row label="Telephone" value={s("telephone")} />
          <Row label="Email"     value={s("email")} />
        </SectionCard>

        {/* Contract */}
        <SectionCard icon={CalendarDays} title="Contract Details">
          <Row label="Contract Date"   value={fmtDate(s("contractdate"))} />
          <Row label="Terminate Date"  value={fmtDate(s("terminatedate"))} />
          <Row label="Billing Name"    value={s("billingname")} />
          <Row label="Billing Address" value={s("billingadd")} />
          <Row label="Bill Address 1"  value={s("billadd1")} />
          <Row label="Bill Address 2"  value={s("billadd2")} />
          {s("unitnote") && (
            <div className="mt-2 pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{s("unitnote")}</p>
            </div>
          )}
        </SectionCard>

        {/* Attendance */}
        <SectionCard icon={Clock} title="Attendance Configuration">
          <Row label="Month Days"      value={n("monthDays") ?? null} />
          <Row label="Hrs / Day"       value={n("HrsPerDay") ?? null} />
          <Row label="OT Setting"      value={s("OT_Setting")} />
          <Row label="OT Pay Mode"     value={s("OTpayMode")} />
          <Row label="OT Month Days"   value={n("otmonthdays") ?? null} />
          <Row label="In Time"         value={s("Unit_InTime") ? new Date(s("Unit_InTime")!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null} />
          <Row label="Out Time"        value={s("Unit_OutTime") ? new Date(s("Unit_OutTime")!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null} />
          <Row label="Separate OT"     value={s("SeperateOT")} />
        </SectionCard>

        {/* Payroll */}
        <SectionCard icon={FileText} title="Payroll Configuration">
          <Row label="PF Setting"     value={s("PF_Setting")} />
          <Row label="PF On Enc"      value={n("PF_OnEnc") ?? null} />
          <Row label="ESI On OT"      value={s("EsiOnOT")} />
          <Row label="WF"             value={n("wf") ?? null} />
          <Row label="Challan"        value={n("challan") ?? null} />
          <Row label="Salary Limit"   value={n("salarylimit") ?? null} />
          <Row label="PT"             value={s("pTax")} />
        </SectionCard>

        {/* Compliance */}
        <SectionCard icon={FileText} title="Compliance">
          <Row label="Is Bonus"       value={s("IsBonus")} />
          <Row label="Bonus On"       value={s("BonusOn")} />
          <Row label="Bonus Rate"     value={n("BonusRate") ?? null} />
          <Row label="Bonus Limit"    value={n("Bonus_Limit") ?? null} />
          <Row label="Is Gratuity"    value={s("IsGratuity")} />
          <Row label="Gratuity Rate"  value={n("gratuityRate") ?? null} />
          <Row label="Emp LWF"        value={n("EMP_LWF") ?? null} />
          <Row label="Empr LWF"       value={n("EMPR_LWF") ?? null} />
          <Row label="Leave All Rate" value={n("LeaveAllRate") ?? null} />
        </SectionCard>

        {/* Billing */}
        <SectionCard icon={FileText} title="Billing Configuration">
          <Row label="Service Charge" value={n("sCharge") ?? null} />
          <Row label="Service Tax"    value={n("sTax") ?? null} />
          <Row label="Coupon Rate"    value={n("CouponRate") ?? null} />
          <Row label="Uniform Rate"   value={n("UniformRate") ?? null} />
          <Row label="Rent"           value={n("rent") ?? null} />
          <Row label="Mess Amount"    value={n("messamt") ?? null} />
        </SectionCard>
      </div>
    </div>
  );
}
