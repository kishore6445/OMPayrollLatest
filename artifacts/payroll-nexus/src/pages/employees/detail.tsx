/**
 * employees/detail.tsx — EMPMAST Employee Profile (read view)
 *
 * Loads via GET /api/employees/:empCode
 * Sensitive fields are pre-masked by the API unless caller has workers:export.
 */

import { useQuery } from "@tanstack/react-query";
import { Link }     from "wouter";
import { Users, ArrowLeft, Pencil } from "lucide-react";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger }  from "@/components/ui/tabs";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

// ── Generic key-value row ─────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value?: string | number | null }) {
  const display = value == null || value === "" ? null : String(value);
  return (
    <div className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0 mr-4">{label}</span>
      <span className={`font-medium text-right max-w-[60%] break-words ${display == null ? "text-muted-foreground/40" : ""}`}>
        {display ?? "—"}
      </span>
    </div>
  );
}

function fmtDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
    return new Date(v).toLocaleDateString("en-IN");
  return String(v);
}

function fmtMoney(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return "₹ " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface Props { params: { empCode: string } }

const STATUS_STYLE: Record<string, string> = {
  A: "text-green-700 border-green-300 bg-green-50",
  I: "text-slate-600 border-slate-300",
  L: "text-orange-700 border-orange-300 bg-orange-50",
  S: "text-blue-700 border-blue-300 bg-blue-50",
  T: "text-red-700 border-red-300 bg-red-50",
};

export default function EmployeeDetailPage({ params }: Props) {
  const empCode = decodeURIComponent(params.empCode);

  const { data: emp, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["employee", empCode],
    queryFn:  () =>
      fetch(`/api/employees/${encodeURIComponent(empCode)}`, { headers: hdr() })
        .then((r) => r.json()),
  });

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading employee…</div>;
  if (!emp || (emp as any).error)
    return <div className="p-6 text-sm text-destructive">Employee not found.</div>;

  const s  = (k: string) => fmtDate(emp[k]);
  const $  = (k: string) => fmtMoney(emp[k]);
  const ws = String(emp.workstatus ?? "");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="mt-0.5">
          <Link href="/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">{String(emp.EmpName ?? "")}</h1>
            <Badge variant="outline" className="font-mono text-xs">{empCode}</Badge>
            {ws && (
              <Badge variant="outline" className={`text-xs ${STATUS_STYLE[ws] ?? ""}`}>
                {ws}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {[
              (emp.DESINAME ?? emp.designation) as string | undefined,
              (emp.Deptname ?? emp.deptcode)    as string | undefined,
              emp.Clientname                    as string | undefined,
              emp.Unitname                      as string | undefined,
              emp.comname                       as string | undefined,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/employees/${encodeURIComponent(empCode)}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
          </Link>
          <Users className="h-6 w-6 text-muted-foreground/30 mt-0.5" />
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="employment">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="statutory">PF / ESI</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="joining">Joining &amp; Exit</TabsTrigger>
        </TabsList>

        {/* ── Employment ─────────────────────────────────────────────────── */}
        <TabsContent value="employment" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Assignment</CardTitle></CardHeader>
              <CardContent>
                <Field label="Emp Code"    value={empCode} />
                <Field label="Company"     value={String(emp.comname   ?? emp.compid ?? "")} />
                <Field label="Client"      value={String(emp.Clientname ?? emp.clientcode ?? "")} />
                <Field label="Site / Unit" value={String(emp.Unitname   ?? emp.unitcode   ?? "")} />
                <Field label="Branch"      value={String(emp.BranchName ?? emp.branchcode ?? "")} />
                <Field label="Zone"        value={String(emp.zonename   ?? emp.zonecode   ?? "")} />
                <Field label="Designation" value={String(emp.DESINAME   ?? emp.designation ?? "")} />
                <Field label="Department"  value={String(emp.Deptname   ?? emp.deptcode    ?? "")} />
                <Field label="Grade"       value={String(emp.GradeName  ?? emp.GradeCode   ?? "")} />
                <Field label="Category"    value={String(emp.catname    ?? emp.catcode     ?? "")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Service</CardTitle></CardHeader>
              <CardContent>
                <Field label="Work Status"       value={ws} />
                <Field label="Date of Joining"   value={s("DOJ")} />
                <Field label="Rel. DOJ"          value={s("RDOJ")} />
                <Field label="Mode of Pay"       value={String(emp.modeofpay ?? "")} />
                <Field label="Shift"             value={String(emp.shift ?? "")} />
                <Field label="Weekly Off"        value={String(emp.weeklyoff ?? "")} />
                <Field label="Token / ESI No"    value={String(emp.tokanno ?? "")} />
                <Field label="Emp Location"      value={String(emp.emplocation ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Personal ───────────────────────────────────────────────────── */}
        <TabsContent value="personal" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Personal Details</CardTitle></CardHeader>
            <CardContent>
              <Field label="Date of Birth"      value={s("DOB")} />
              <Field label="Gender"             value={String(emp.Sex ?? "")} />
              <Field label="Marital Status"     value={String(emp.Married ?? "")} />
              <Field label="Father / Husband"   value={String(emp.FHName ?? "")} />
              <Field label="F/H Indicator"      value={String(emp.cmbFH ?? "")} />
              <Field label="Mother Name"        value={String(emp.mothername ?? "")} />
              <Field label="Spouse Name"        value={String(emp.SpouseName ?? "")} />
              <Field label="Children"           value={emp.children != null ? String(emp.children) : null} />
              <Field label="Blood Group"        value={String(emp.BlodGroup ?? "")} />
              <Field label="Nationality"        value={String(emp.Nationality ?? "")} />
              <Field label="Mobile"             value={String(emp.MobNo ?? "")} />
              <Field label="Email"              value={String(emp.emailID ?? "")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Salary ─────────────────────────────────────────────────────── */}
        <TabsContent value="salary" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Earnings</CardTitle></CardHeader>
              <CardContent>
                <Field label="Basic"         value={$("basic")} />
                <Field label="HRA"           value={$("hra")} />
                <Field label="VDA"           value={$("vda")} />
                <Field label="Conveyance"    value={$("conv")} />
                <Field label="CCA"           value={$("cca")} />
                <Field label="Washing"       value={$("washall")} />
                <Field label="Medical"       value={$("medical")} />
                <Field label="Special"       value={$("specialAll")} />
                <Field label="Education"     value={$("EduAll")} />
                <Field label="Telephone"     value={$("TelAll")} />
                <Field label="LTA"           value={$("LTA")} />
                <Field label="Other Allow."  value={$("allowences")} />
                <Field label="Gross"         value={$("Gross")} />
                <Field label="CTC"           value={$("ctc")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Rates &amp; Options</CardTitle></CardHeader>
              <CardContent>
                <Field label="HRA %"         value={String(emp.HRAper ?? "")} />
                <Field label="Daily Wages"   value={$("dailywages")} />
                <Field label="Fixed Rate"    value={emp.FixRate != null ? String(emp.FixRate) : null} />
                <Field label="Per Day Rate"  value={emp.IsPerDayRate != null ? String(emp.IsPerDayRate) : null} />
                <Field label="Allow OT"      value={String(emp.IsAllowOT ?? "")} />
                <Field label="Bonus"         value={String(emp.IsBonus ?? "")} />
                <Field label="Leave"         value={String(emp.IsLeave ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PF / ESI ───────────────────────────────────────────────────── */}
        <TabsContent value="statutory" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Provident Fund</CardTitle></CardHeader>
              <CardContent>
                <Field label="PF Applicable"     value={String(emp.APPLICABLE ?? "")} />
                <Field label="UAN No"             value={String(emp.UANNo ?? "")} />
                <Field label="PF Employee (₹)"   value={$("pf")} />
                <Field label="VPF (₹)"           value={$("VPF")} />
                <Field label="VPF Rate (%)"       value={String(emp.VPFRate ?? "")} />
                <Field label="PF Wage Elig."      value={String(emp.PFWageEligibility ?? "")} />
                <Field label="PF Limit"           value={$("PFLimit")} />
                <Field label="Is Pension"         value={String(emp.IsPension ?? "")} />
                <Field label="PF on Full"         value={String(emp.IsPFonFull ?? "")} />
                <Field label="PF Date"            value={s("pfDate")} />
                <Field label="Is ABRY"            value={String(emp.IsAbry ?? "")} />
                <Field label="PF Bank A/c"        value={String(emp.PFBanAcc ?? "")} />
                <Field label="PF Bank IFSC"       value={String(emp.PFBankIFSC ?? "")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ESI &amp; PT</CardTitle></CardHeader>
              <CardContent>
                <Field label="ESI Token No"      value={String(emp.tokanno ?? "")} />
                <Field label="ESI Employee (₹)"  value={$("esi")} />
                <Field label="ESI Limit"         value={$("ESILimit")} />
                <Field label="ESI Date"          value={s("EsiDate")} />
                <Field label="P-Tax Applicable"  value={String(emp.IsPtax ?? "")} />
                <Field label="P-Tax (₹)"         value={$("PTax")} />
                <Field label="PT Date"           value={s("PTaxDate")} />
                <Field label="LWF Applicable"    value={String(emp.IsLWF ?? "")} />
                <Field label="LWF ID"            value={String(emp.LWFID ?? "")} />
                <Field label="LWF Date"          value={s("LwfDate")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Identity Numbers</CardTitle></CardHeader>
              <CardContent>
                <Field label="PAN No"        value={String(emp.PAN_no ?? "")} />
                <Field label="Aadhaar No"    value={String(emp.adharcardno ?? "")} />
                <Field label="UAN No"        value={String(emp.UANNo ?? "")} />
                <Field label="UAN Bank"      value={String(emp.UANBankName ?? "")} />
                <Field label="UAN Bank A/c"  value={String(emp.UANBankAcc ?? "")} />
                <Field label="UAN IFSC"      value={String(emp.UANBankIFSC ?? "")} />
                <Field label="Is KYC"        value={String(emp.IsKYC ?? "")} />
                <Field label="Name on Adhar" value={String(emp.NameOnAdhar ?? "")} />
                <Field label="Name on PAN"   value={String(emp.NameOnPAN ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Bank ───────────────────────────────────────────────────────── */}
        <TabsContent value="bank" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bank Details</CardTitle></CardHeader>
            <CardContent>
              <Field label="Mode of Pay"    value={String(emp.modeofpay ?? "")} />
              <Field label="Bank Code"      value={String(emp.bankcode ?? "")} />
              <Field label="Name in Bank"   value={String(emp.NameInBank ?? "")} />
              <Field label="Bank Branch"    value={String(emp.BankBranchName ?? "")} />
              <Field label="Account No"     value={String(emp.acno ?? "")} />
              <Field label="IFSC"           value={String(emp.SavingIFSCCode ?? "")} />
              <Field label="MICR"           value={String(emp.MICRCode ?? "")} />
              <Field label="A/c Verified"   value={emp.isAcctVarify != null ? (emp.isAcctVarify ? "Yes" : "No") : null} />
              <Field label="Benef. Name"    value={String(emp.VerifiedBeneficiaryName ?? "")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Address ────────────────────────────────────────────────────── */}
        <TabsContent value="address" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Permanent Address</CardTitle></CardHeader>
              <CardContent>
                <Field label="Address 1"  value={String(emp.addref1 ?? "")} />
                <Field label="Address 2"  value={String(emp.addref2 ?? "")} />
                <Field label="Contact"    value={String(emp.contnoref ?? "")} />
                <Field label="State"      value={String(emp.PERMANENTSTATE ?? "")} />
                <Field label="District"   value={String(emp.permanentDist ?? "")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Local Address</CardTitle></CardHeader>
              <CardContent>
                <Field label="Address 1"  value={String(emp.localadd1 ?? "")} />
                <Field label="Address 2"  value={String(emp.localadd2 ?? "")} />
                <Field label="Contact"    value={String(emp.contnolocal ?? "")} />
                <Field label="PIN"        value={String(emp.localpin ?? "")} />
                <Field label="State"      value={String(emp.LOCALSTATE ?? "")} />
                <Field label="District"   value={String(emp.localDist ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Documents ──────────────────────────────────────────────────── */}
        <TabsContent value="documents" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ID Proof</CardTitle></CardHeader>
              <CardContent>
                <Field label="ID Proof Type"   value={String(emp.IDProof ?? "")} />
                <Field label="ID Proof No"     value={String(emp.IDProofNo ?? "")} />
                <Field label="ID Proof Name"   value={String(emp.IDProofName ?? "")} />
                <Field label="ID Exp Date"     value={s("IDProofExpDate")} />
                <Field label="Voter ID No"     value={String(emp.voterIDNo ?? "")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Additional Documents</CardTitle></CardHeader>
              <CardContent>
                <Field label="Doc 1 Type"    value={String(emp.Doc1Type ?? "")} />
                <Field label="Doc 1 No"      value={String(emp.Doc1No ?? "")} />
                <Field label="Doc 1 Name"    value={String(emp.Doc1Name ?? "")} />
                <Field label="Doc 2 Type"    value={String(emp.Doc2Type ?? "")} />
                <Field label="Doc 2 No"      value={String(emp.Doc2No ?? "")} />
                <Field label="Pass. Issue"   value={s("PIssueDate")} />
                <Field label="Pass. Expiry"  value={s("PValidDate")} />
                <Field label="PSARA"         value={String(emp.pSARA_Trng ?? "")} />
                <Field label="Police Ver."   value={String(emp.police_Vari ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Joining & Exit ─────────────────────────────────────────────── */}
        <TabsContent value="joining" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Joining</CardTitle></CardHeader>
              <CardContent>
                <Field label="Date of Joining"   value={s("DOJ")} />
                <Field label="Rel. DOJ"          value={s("RDOJ")} />
                <Field label="Application Date"  value={s("applicationdate")} />
                <Field label="Application No"    value={String(emp.applicationno ?? "")} />
                <Field label="Interview Date"    value={s("interviewdate")} />
                <Field label="Is Rejoin"         value={String(emp.IsRejoin ?? "")} />
                <Field label="New Employee"      value={String(emp.newEmp ?? "")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Exit / Separation</CardTitle></CardHeader>
              <CardContent>
                <Field label="Work Status"       value={ws} />
                <Field label="Resignation Det."  value={String(emp.resg_det ?? "")} />
                <Field label="PF Settlement"     value={String(emp.IsPFSettlement ?? "")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
