/**
 * workers/detail.tsx — EMPMAST full employee profile
 *
 * GET /api/workers/:EmpCode
 * The API returns the full EMPMAST row (minus computed fields) + joined lookup names.
 * Sensitive fields (adharcardno, PAN_no, acno, UANNo, tokanno) are masked unless
 * the caller holds workers:export permission.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right max-w-[60%] break-words ${value == null || value === "" ? "text-muted-foreground/50" : ""}`}>
        {value == null || value === "" ? "—" : String(value)}
      </span>
    </div>
  );
}

function fmt(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(v).toLocaleDateString("en-IN");
  }
  return String(v);
}

function money(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface Props { params: { id: string } }

export default function WorkerDetailPage({ params }: Props) {
  const empCode = decodeURIComponent(params.id);
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("workers", "write");
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: emp, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["worker", empCode],
    queryFn: () =>
      fetch(`/api/workers/${encodeURIComponent(empCode)}`, { headers: hdr() }).then((r) => r.json()),
  });

  const deleteEmployee = useMutation({
    mutationFn: async () => {
      const compid = Number(emp?.compid);
      const suffix = Number.isFinite(compid) ? `?compid=${encodeURIComponent(String(compid))}` : "";
      const r = await fetch(`/api/workers/${encodeURIComponent(empCode)}${suffix}`, { method: "DELETE", headers: hdr() });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Delete failed (${r.status})`);
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workers"] });
      await qc.invalidateQueries({ queryKey: ["workers-counts"] });
      toast({ title: "Employee deleted", description: "The employee master record and mapped Employee login were removed." });
      navigate("/workers");
    },
    onError: (e: Error) => toast({ title: "Cannot delete employee", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading…</div>;
  if (!emp || (emp as any).error) return <div className="p-6 text-sm text-destructive">Employee not found.</div>;

  const s = (k: string) => fmt(emp[k]);
  const m = (k: string) => money(emp[k]);

  const isMasked = (v: unknown): boolean =>
    typeof v === "string" && (v.startsWith("XXXX") || v.startsWith("XXXXX"));

  const sensitive = (k: string) => {
    const v = emp[k];
    if (v == null) return null;
    return isMasked(v) ? (
      <span className="text-muted-foreground italic text-xs">{String(v)} (masked)</span>
    ) : String(v);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="mt-0.5">
          <Link href="/workers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">{s("EmpName")}</h1>
            <Badge variant="outline" className="font-mono text-xs">{s("EmpCode")}</Badge>
            {s("workstatus") && (
              <Badge
                variant="outline"
                className={
                  emp.workstatus === "A"
                    ? "text-green-700 border-green-300"
                    : emp.workstatus === "L" || emp.workstatus === "T"
                    ? "text-red-700 border-red-300"
                    : "text-slate-600 border-slate-300"
                }
              >
                {s("workstatus")}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {[s("DESINAME") ?? s("designation"), s("Deptname") ?? s("deptcode"), s("Unitname")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/workers/${encodeURIComponent(empCode)}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Employee
              </Link>
            </Button>
            <ConfirmDialog
              trigger={<Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</Button>}
              title="Permanently delete employee?"
              description="This removes the EMPMAST record and mapped Employee login. If payroll, attendance or history records still reference this employee, the server will block deletion."
              confirmLabel={deleteEmployee.isPending ? "Deleting…" : "Delete employee"}
              variant="destructive"
              onConfirm={() => deleteEmployee.mutate()}
            />
          </div>
        )}
        <Users className="h-6 w-6 text-muted-foreground/40 mt-1 hidden md:block" />
      </div>

      <Tabs defaultValue="employment">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="statutory">Statutory</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Employment */}
        <TabsContent value="employment" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Assignment</CardTitle></CardHeader>
              <CardContent>
                <Field label="Emp Code"          value={s("EmpCode")} />
                <Field label="Company"           value={s("comname") ?? s("compid")} />
                <Field label="Client"            value={s("Unitname") ?? s("unitcode")} />
                <Field label="Zone"              value={s("zonename") ?? s("zonecode")} />
                <Field label="Designation"       value={s("DESINAME") ?? s("designation")} />
                <Field label="Department"        value={s("Deptname") ?? s("deptcode")} />
                <Field label="Grade"             value={s("GradeName") ?? s("GradeCode")} />
                <Field label="Category"          value={s("catname") ?? s("catcode")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Service</CardTitle></CardHeader>
              <CardContent>
                <Field label="Date of Joining"   value={s("DOJ")} />
                <Field label="Rel. DOJ"          value={s("RDOJ")} />
                <Field label="Work Status"       value={s("workstatus")} />
                <Field label="Mode of Pay"       value={s("modeofpay")} />
                <Field label="Shift"             value={s("shift")} />
                <Field label="Weekly Off"        value={s("weeklyoff")} />
                <Field label="Location"          value={s("emplocation")} />
                <Field label="Reason for Leaving" value={s("resg_det")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Salary */}
        <TabsContent value="salary" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Earnings</CardTitle></CardHeader>
              <CardContent>
                <Field label="Basic"       value={m("basic")} />
                <Field label="HRA"        value={m("hra")} />
                <Field label="VDA"        value={m("vda")} />
                <Field label="Conveyance" value={m("conv")} />
                <Field label="CCA"        value={m("cca")} />
                <Field label="CEA"        value={m("cea")} />
                <Field label="Washing"    value={m("washall")} />
                <Field label="Medical"    value={m("medical")} />
                <Field label="Special"    value={m("specialAll")} />
                <Field label="LTA"        value={m("LTA")} />
                <Field label="Other Allow" value={m("allowences")} />
                <Field label="Gross"      value={m("Gross")} />
                <Field label="CTC"        value={m("ctc")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Deductions &amp; Other</CardTitle></CardHeader>
              <CardContent>
                <Field label="Daily Wages" value={m("dailywages")} />
                <Field label="Gross CTC"  value={m("grossCTC")} />
                <Field label="HRA %"      value={s("HRAper")} />
                <Field label="Bonus On"   value={s("bonusOn")} />
                <Field label="Bonus Rate %" value={s("bonusRate")} />
                <Field label="Bonus Limit" value={m("bonusLimit")} />
                <Field label="EmpMday"    value={s("EmpMday")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Statutory */}
        <TabsContent value="statutory" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Provident Fund</CardTitle></CardHeader>
              <CardContent>
                <Field label="PF Applicable" value={s("APPLICABLE")} />
                <Field label="UAN No"        value={s("UANNo")} />
                <Field label="PF Amount"     value={m("pf")} />
                <Field label="VPF Rate %"    value={s("VPFRate")} />
                <Field label="PF Limit"      value={m("PFLimit")} />
                <Field label="Is Pension"    value={s("IsPension")} />
                <Field label="PF Bank A/c"   value={s("PFBanAcc")} />
                <Field label="PF Bank IFSC"  value={s("PFBankIFSC")} />
                <Field label="PF Eff. Date"  value={s("pfDate")} />
                <Field label="ABRY"          value={s("IsAbry")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ESI, PT &amp; LWF</CardTitle></CardHeader>
              <CardContent>
                <Field label="ESI Wage"      value={m("esi")} />
                <Field label="ESI Limit"     value={m("ESILimit")} />
                <Field label="ESI Token No (tokanno)" value={s("tokanno")} />
                <Field label="ESI Eff. Date" value={s("EsiDate")} />
                <Field label="Is PT"         value={s("IsPtax")} />
                <Field label="PT Eff. Date"  value={s("PTaxDate")} />
                <Field label="Is LWF"        value={s("IsLWF")} />
                <Field label="LWF Eff. Date" value={s("LwfDate")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Bank */}
        <TabsContent value="bank" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bank &amp; Identity</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-between py-1.5 border-b border-border/40 text-sm">
                <span className="text-muted-foreground shrink-0">Account No</span>
                <span className="font-medium text-right max-w-[60%] break-words">{sensitive("acno") ?? "—"}</span>
              </div>
              <Field label="Bank Code"     value={s("bankcode")} />
              <Field label="Name in Bank"  value={s("NameInBank")} />
              <Field label="Bank Branch"   value={s("BankBranchName")} />
              <Field label="IFSC"          value={s("SavingIFSCCode")} />
              <Field label="MICR"          value={s("MICRCode")} />
              <Field label="A/c Verified"  value={s("isAcctVarify")} />
              <div className="flex justify-between py-1.5 border-b border-border/40 text-sm">
                <span className="text-muted-foreground shrink-0">Aadhaar No</span>
                <span className="font-medium text-right max-w-[60%] break-words">{sensitive("adharcardno") ?? "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/40 text-sm">
                <span className="text-muted-foreground shrink-0">PAN No</span>
                <span className="font-medium text-right max-w-[60%] break-words">{sensitive("PAN_no") ?? "—"}</span>
              </div>
              <Field label="Name on Aadhaar" value={s("NameOnAdhar")} />
              <Field label="Name on PAN"   value={s("NameOnPAN")} />
              <Field label="Voter ID"      value={s("voterIDNo")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personal */}
        <TabsContent value="personal" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Personal Details</CardTitle></CardHeader>
            <CardContent>
              <Field label="Date of Birth"  value={s("DOB")} />
              <Field label="Gender"         value={s("Sex")} />
              <Field label="Marital Status" value={s("Married")} />
              <Field label="Spouse Name"    value={s("SpouseName")} />
              <Field label="Children"       value={s("children")} />
              <Field label="Blood Group"    value={s("BlodGroup")} />
              <Field label="Nationality"    value={s("Nationality")} />
              <Field label="Father/Spouse"  value={s("FHName")} />
              <Field label="F/H Indicator"  value={s("cmbFH")} />
              <Field label="Mother Name"    value={s("mothername")} />
              <Field label="Mobile"         value={s("MobNo")} />
              <Field label="Email"          value={s("emailID")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address */}
        <TabsContent value="address" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Local / Current Address</CardTitle></CardHeader>
              <CardContent>
                <Field label="Address 1"  value={s("localadd1")} />
                <Field label="Address 2"  value={s("localadd2")} />
                <Field label="Contact No" value={s("contnolocal")} />
                <Field label="PIN"        value={s("localpin")} />
                <Field label="State"      value={s("LOCALSTATE")} />
                <Field label="District"   value={s("localDist")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Permanent Address</CardTitle></CardHeader>
              <CardContent>
                <Field label="Address 1"  value={s("addref1")} />
                <Field label="Address 2"  value={s("addref2")} />
                <Field label="Contact No" value={s("contnoref")} />
                <Field label="PIN"        value={s("permanentpin")} />
                <Field label="State"      value={s("PERMANENTSTATE")} />
                <Field label="District"   value={s("permanentDist")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ID &amp; KYC</CardTitle></CardHeader>
              <CardContent>
                <Field label="ID Proof Type"   value={s("IDProof")} />
                <Field label="ID Proof No"     value={s("IDProofNo")} />
                <Field label="ID Proof Name"   value={s("IDProofName")} />
                <Field label="ID Expiry Date"  value={s("IDProofExpDate")} />
                <Field label="KYC Done"        value={s("IsKYC")} />
                <Field label="Police Verified" value={s("police_Vari")} />
                <Field label="PSARA Training"  value={s("pSARA_Trng")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Supporting Documents</CardTitle></CardHeader>
              <CardContent>
                <Field label="Doc 1 Type"   value={s("Doc1Type")} />
                <Field label="Doc 1 No"     value={s("Doc1No")} />
                <Field label="Doc 1 Name"   value={s("Doc1Name")} />
                <Field label="Doc 2 Type"   value={s("Doc2Type")} />
                <Field label="Doc 2 No"     value={s("Doc2No")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Record Metadata</CardTitle></CardHeader>
            <CardContent>
              <Field label="Created by (User ID)"   value={s("RecordInsertByUserID")} />
              <Field label="Created on"             value={s("RecordInsertDate")} />
              <Field label="Last updated by (User ID)" value={s("RecordUpdateByUserID")} />
              <Field label="Last updated on"        value={s("RecordUpdateDate")} />
              <Field label="Card No"                value={s("CardNo")} />
              <Field label="Old Emp Code"           value={s("oldEmpcode")} />
              <Field label="Update Reason"          value={s("updreason")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
