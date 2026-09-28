/**
 * employees/form.tsx — Add / Edit Employee (EMPMAST)
 *
 * POST /api/employees  (create)
 * PATCH /api/employees/:empCode (edit)
 *
 * 10 tabs:
 *   1. Basic Information
 *   2. Employment & Assignment
 *   3. Contact & Address
 *   4. Bank & Payment
 *   5. PF / ESI / Statutory
 *   6. Salary & Allowances
 *   7. Leave & Overtime
 *   8. Documents & Verification
 *   9. Joining & Exit
 *  10. Advanced Legacy Fields
 */

import { useState, useEffect } from "react";
import { useLocation }          from "wouter";
import { useQuery }             from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { Link }                 from "wouter";
import { Button }               from "@/components/ui/button";
import { Input }                from "@/components/ui/input";
import { Label }                from "@/components/ui/label";
import { PageHeader }           from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle }  from "@/components/ui/card";
import { useToast }             from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const hdr = () => ({
  Authorization:  `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

// ── Form field row ────────────────────────────────────────────────────────────
function FRow({ label, required, error, hint, children }: {
  label:    string;
  required?: boolean;
  error?:   string | null;
  hint?:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 py-2 border-b border-border/30 last:border-0">
      <Label className="text-sm pt-2 text-right pr-2 text-muted-foreground col-span-1">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="col-span-2 space-y-1">
        {children}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {hint  && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

// ── Select wrapper ────────────────────────────────────────────────────────────
function Sel({ value, onChange, placeholder, children, disabled }: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
  children:    React.ReactNode;
  disabled?:   boolean;
}) {
  return (
    <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

// ── Number input ──────────────────────────────────────────────────────────────
function NumInput({ value, onChange, placeholder = "0.00", ...rest }: {
  value:       string | number | null | undefined;
  onChange:    (v: string) => void;
  placeholder?: string;
  [k: string]: unknown;
}) {
  return (
    <Input
      type="number"
      min="0"
      step="0.01"
      className="h-9"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

// ── Text input ────────────────────────────────────────────────────────────────
function TxtInput({ value, onChange, placeholder = "", maxLength, ...rest }: {
  value:       string | number | null | undefined;
  onChange:    (v: string) => void;
  placeholder?: string;
  maxLength?:  number;
  [k: string]: unknown;
}) {
  return (
    <Input
      className="h-9"
      placeholder={placeholder}
      maxLength={maxLength}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

// ── Date input ────────────────────────────────────────────────────────────────
function DateInput({ value, onChange }: {
  value:   string | null | undefined;
  onChange: (v: string) => void;
}) {
  const iso = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <Input
      type="date"
      className="h-9"
      value={iso}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
    />
  );
}

type FormData = Record<string, string | number | null>;

interface Props { params: { empCode?: string } }

export default function EmployeeFormPage({ params }: Props) {
  const empCode  = params.empCode ? decodeURIComponent(params.empCode) : null;
  const isEdit   = !!empCode;
  const [,navigate] = useLocation();
  const { toast }   = useToast();

  const [form,    setForm]    = useState<FormData>({});
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [verifyingBank, setVerifyingBank] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // ── Load existing employee on edit ────────────────────────────────────────
  const { data: existing, isLoading: loadingEmp } = useQuery<Record<string, unknown>>({
    queryKey: ["employee-edit", empCode],
    queryFn:  () =>
      fetch(`/api/employees/${encodeURIComponent(empCode!)}`, { headers: hdr() })
        .then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing && !("error" in existing)) {
      const clean: FormData = {};
      for (const [k, v] of Object.entries(existing)) {
        clean[k] = v == null ? null : (typeof v === "object" ? null : v as string | number);
      }
      setForm(clean);
    }
  }, [existing]);

  // ── Lookup data ───────────────────────────────────────────────────────────
  const selectedCompid = form.compid ? String(form.compid) : "";
  const selectedClient = form.clientcode ? String(form.clientcode) : "";

  const { data: companies = [] } = useQuery<{ compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string }[]>({
    queryKey: ["companies-form-scoped"],
    queryFn:  () => fetch("/api/scoped/companies", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: clients = [] } = useQuery<{ clientcode: number; Clientname: string }[]>({
    queryKey: ["clients-form", selectedCompid],
    queryFn:  () => {
      const qs = new URLSearchParams({ pageSize: "500" });
      if (selectedCompid) qs.set("compid", selectedCompid);
      return fetch(`/api/scoped/clients?${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 120_000,
  });

  const { data: units = [] } = useQuery<{ unitcode: string; Unitname: string }[]>({
    queryKey: ["units-form", selectedCompid, selectedClient],
    queryFn:  () => {
      const qs = new URLSearchParams({ pageSize: "500" });
      if (selectedCompid) qs.set("compid", selectedCompid);
      if (selectedClient) qs.set("clientcode", selectedClient);
      return fetch(`/api/scoped/units?${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 120_000,
  });

  const { data: branches = [] } = useQuery<{ BranchCode: number; BranchName: string }[]>({
    queryKey: ["branches-form", selectedCompid],
    queryFn:  () => {
      const qs = new URLSearchParams({ pageSize: "200" });
      if (selectedCompid) qs.set("compid", selectedCompid);
      return fetch(`/api/scoped/branches?${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 120_000,
  });

  const { data: designations = [] } = useQuery<{ DESICODE: number; DESINAME: string; is_active?: boolean }[]>({
    queryKey: ["designations"],
    queryFn:  () => fetch("/api/masters/designations", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: departments = [] } = useQuery<{ deptcode: string; Deptname: string }[]>({
    queryKey: ["departments"],
    queryFn:  () => fetch("/api/masters/departments", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: grades = [] } = useQuery<{ GradeCode: number; GradeName: string }[]>({
    queryKey: ["grades"],
    queryFn:  () => fetch("/api/masters/grades", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: categories = [] } = useQuery<{ catcode: number; catname: string }[]>({
    queryKey: ["categories", selectedCompid],
    queryFn:  () => {
      const qs = selectedCompid ? `?compid=${selectedCompid}` : "";
      return fetch(`/api/masters/categories${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 120_000,
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set = (key: string) => (val: string | number | null) =>
    setForm((f) => ({ ...f, [key]: val === "" ? null : val }));

  const str = (k: string): string => form[k] != null ? String(form[k]) : "";
  const num = (k: string): string => form[k] != null ? String(form[k]) : "";

  const pfApplicable = str("APPLICABLE").toLowerCase() === "true";
  const bankPayment  = str("modeofpay").toLowerCase() === "bank";
  const exitStatus   = ["L","Left","T","Terminated","R","Resigned","S","Suspended"].includes(str("workstatus"));

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleBankVerification() {
    if (!isEdit || !empCode) {
      toast({ title: "Save employee first", description: "Create the employee, then verify the saved bank details." });
      return;
    }
    if (!str("acno").trim() || !str("SavingIFSCCode").trim()) {
      toast({ title: "Bank details required", description: "Enter and save the account number and IFSC first.", variant: "destructive" });
      return;
    }

    setVerifyingBank(true);
    try {
      const currentAccount = String((existing as any)?.acno ?? "").trim();
      const currentIfsc = String((existing as any)?.SavingIFSCCode ?? "").trim().toUpperCase();
      if (str("acno").trim() !== currentAccount || str("SavingIFSCCode").trim().toUpperCase() !== currentIfsc) {
        const saveResp = await fetch(`/api/employees/${encodeURIComponent(empCode)}`, {
          method: "PATCH", headers: hdr(),
          body: JSON.stringify({ acno: str("acno").trim(), SavingIFSCCode: str("SavingIFSCCode").trim().toUpperCase(), NameInBank: str("NameInBank").trim() }),
        });
        const saveData = await saveResp.json();
        if (!saveResp.ok) throw new Error((saveData as any).error ?? "Could not save bank details");
      }
      const resp = await fetch(`/api/employees/${encodeURIComponent(empCode)}/bank/verify-penniless`, { method: "POST", headers: hdr(), body: JSON.stringify({}) });
      const data = await resp.json();
      if (!resp.ok) throw new Error((data as any).error ?? "Bank verification failed");
      setForm((f) => ({ ...f, isAcctVarify: (data as any).verified ? 1 : 0, VerifiedBeneficiaryName: (data as any).beneficiaryName ?? "" }));
      toast((data as any).verified
        ? { title: "Bank account verified", description: (data as any).beneficiaryName ? `Beneficiary: ${(data as any).beneficiaryName}` : "Account exists and is active." }
        : { title: "Bank account not verified", description: "The provider could not confirm this account.", variant: "destructive" });
    } catch (err) {
      toast({ title: "Verification failed", description: err instanceof Error ? err.message : "Unable to verify bank account", variant: "destructive" });
    } finally { setVerifyingBank(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSaving(true);

    // Client-side quick checks
    const err: Record<string, string> = {};
    if (!isEdit && !str("EmpCode").trim()) err.EmpCode = "Required";
    if (!str("EmpName").trim())            err.EmpName = "Required";
    if (!str("compid"))                    err.compid  = "Required";
    if (!str("DOJ"))                       err.DOJ     = "Required";
    if (!str("workstatus"))                err.workstatus = "Required";
    if (bankPayment && !str("acno").trim())        err.acno          = "Required for Bank payment";
    if (bankPayment && !str("SavingIFSCCode").trim()) err.SavingIFSCCode = "Required for Bank payment";
    if (pfApplicable && !str("UANNo").trim())      err.UANNo         = "Required when PF applicable";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      setSaving(false);
      return;
    }

    // Strip null / empty strings for clean payload
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== null && v !== "") payload[k] = v;
    }

    const url    = isEdit ? `/api/employees/${encodeURIComponent(empCode!)}` : "/api/employees";
    const method = isEdit ? "PATCH" : "POST";

    const resp = await fetch(url, {
      method,
      headers: hdr(),
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (resp.ok) {
      const data = await resp.json();
      const code = (data as any).EmpCode ?? empCode ?? str("EmpCode");
      toast({ title: isEdit ? "Employee updated" : "Employee created", description: `EmpCode: ${code}` });
      navigate(`/employees/${encodeURIComponent(code)}`);
    } else {
      const body = await resp.json().catch(() => ({}));
      const msg  = (body as any).error ?? "An unexpected error occurred";
      setErrors({ _form: msg });
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  if (isEdit && loadingEmp)
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading employee…</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={isEdit ? `/employees/${encodeURIComponent(empCode!)}` : "/employees"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={isEdit ? `Edit Employee — ${empCode}` : "Add Employee"}
          subtitle="EMPMAST"
          icon={null}
        />
      </div>

      {errors._form && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errors._form}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1 mb-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="contact">Contact &amp; Address</TabsTrigger>
            <TabsTrigger value="bank">Bank &amp; Payment</TabsTrigger>
            <TabsTrigger value="statutory">PF / ESI</TabsTrigger>
            <TabsTrigger value="salary">Salary</TabsTrigger>
            <TabsTrigger value="leave">Leave &amp; OT</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="joining">Joining &amp; Exit</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Basic Information ────────────────────────────────── */}
          <TabsContent value="basic">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Employee Code" required error={errors.EmpCode}>
                  <TxtInput
                    value={str("EmpCode")} onChange={set("EmpCode")}
                    placeholder="e.g. EMP001" maxLength={25}
                    disabled={isEdit}
                  />
                </FRow>
                <FRow label="Employee Name" required error={errors.EmpName}>
                  <TxtInput value={str("EmpName")} onChange={set("EmpName")} placeholder="Full name" maxLength={50} />
                </FRow>
                <FRow label="Father / Spouse Name">
                  <TxtInput value={str("FHName")} onChange={set("FHName")} placeholder="Father or spouse name" maxLength={50} />
                </FRow>
                <FRow label="F/H Indicator" hint="F = Father, S = Spouse / Husband">
                  <Sel value={str("cmbFH")} onChange={set("cmbFH")} placeholder="Select">
                    <SelectItem value="F">F — Father</SelectItem>
                    <SelectItem value="S">S — Spouse / Husband</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Mother Name">
                  <TxtInput value={str("mothername")} onChange={set("mothername")} placeholder="Mother's name" maxLength={50} />
                </FRow>
                <FRow label="Date of Birth">
                  <DateInput value={str("DOB")} onChange={set("DOB")} />
                </FRow>
                <FRow label="Gender">
                  <Sel value={str("Sex")} onChange={set("Sex")} placeholder="Select gender">
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="T">Transgender</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Marital Status">
                  <Sel value={str("Married")} onChange={set("Married")} placeholder="Select">
                    <SelectItem value="Y">Married (Y)</SelectItem>
                    <SelectItem value="N">Unmarried (N)</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Spouse Name">
                  <TxtInput value={str("SpouseName")} onChange={set("SpouseName")} placeholder="Spouse name" maxLength={50} />
                </FRow>
                <FRow label="Children">
                  <Input type="number" min="0" className="h-9" value={num("children")}
                         onChange={(e) => set("children")(e.target.value)} placeholder="0" />
                </FRow>
                <FRow label="Blood Group">
                  <Sel value={str("BlodGroup")} onChange={set("BlodGroup")} placeholder="Select">
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Nationality">
                  <TxtInput value={str("Nationality")} onChange={set("Nationality")} placeholder="e.g. Indian" maxLength={50} />
                </FRow>
                <FRow label="Mobile" hint="10 digits" error={errors.MobNo}>
                  <TxtInput value={str("MobNo")} onChange={set("MobNo")} placeholder="9876543210" maxLength={50} />
                </FRow>
                <FRow label="Email" error={errors.emailID}>
                  <TxtInput value={str("emailID")} onChange={set("emailID")} placeholder="employee@example.com" maxLength={50} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Employment & Assignment ─────────────────────────── */}
          <TabsContent value="employment">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Employment &amp; Assignment</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Company" required error={errors.compid}>
                  <Sel value={str("compid")} onChange={(v) => {
                    set("compid")(v);
                    set("clientcode")(""); set("unitcode")(""); set("branchcode")("");
                  }} placeholder="Select company">
                    {companies.map((c) => (
                      <SelectItem key={c.compid} value={String(c.compid)}>{c.displayLabel ?? `${c.comname} — ID ${c.compid}`}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Client">
                  <Sel value={str("clientcode")} onChange={(v) => { set("clientcode")(v); set("unitcode")(""); }}
                       placeholder="Select client" disabled={!selectedCompid}>
                    {clients.map((c) => (
                      <SelectItem key={c.clientcode} value={String(c.clientcode)}>{c.Clientname}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Unit / Site">
                  <Sel value={str("unitcode")} onChange={set("unitcode")}
                       placeholder="Select unit" disabled={!selectedClient && !selectedCompid}>
                    {units.map((u) => (
                      <SelectItem key={u.unitcode} value={u.unitcode}>{u.Unitname} ({u.unitcode})</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Branch">
                  <Sel value={str("branchcode")} onChange={set("branchcode")}
                       placeholder="Select branch" disabled={!selectedCompid}>
                    {branches.map((b) => (
                      <SelectItem key={b.BranchCode} value={String(b.BranchCode)}>{b.BranchName}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Department">
                  <Sel value={str("deptcode")} onChange={set("deptcode")} placeholder="Select department">
                    {departments.map((d) => (
                      <SelectItem key={d.deptcode} value={d.deptcode}>{d.Deptname}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Designation">
                  <Sel value={str("designation")} onChange={set("designation")} placeholder="Select designation">
                    {designations.map((d) => (
                      <SelectItem key={d.DESICODE} value={String(d.DESICODE)} disabled={d.is_active === false}>{d.DESINAME}{d.is_active === false ? " (Inactive)" : ""}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Grade">
                  <Sel value={str("GradeCode")} onChange={set("GradeCode")} placeholder="Select grade">
                    {grades.map((g) => (
                      <SelectItem key={g.GradeCode} value={String(g.GradeCode)}>{g.GradeName}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Category">
                  <Sel value={str("catcode")} onChange={set("catcode")} placeholder="Select category">
                    {categories.map((c) => (
                      <SelectItem key={c.catcode} value={String(c.catcode)}>{c.catname}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Work Status" required error={errors.workstatus}>
                  <Sel value={str("workstatus")} onChange={set("workstatus")} placeholder="Select status">
                    <SelectItem value="A">Active (A)</SelectItem>
                    <SelectItem value="I">Inactive (I)</SelectItem>
                    <SelectItem value="L">Left (L)</SelectItem>
                    <SelectItem value="S">Suspended (S)</SelectItem>
                    <SelectItem value="T">Terminated (T)</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Date of Joining" required error={errors.DOJ}>
                  <DateInput value={str("DOJ")} onChange={set("DOJ")} />
                </FRow>
                <FRow label="Rel. Date of Joining" hint="Relative / rejoining date">
                  <DateInput value={str("RDOJ")} onChange={set("RDOJ")} />
                </FRow>
                <FRow label="Mode of Payment">
                  <Sel value={str("modeofpay")} onChange={set("modeofpay")} placeholder="Select mode">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Shift">
                  <Input type="number" min="0" className="h-9" value={num("shift")}
                         onChange={(e) => set("shift")(e.target.value)} placeholder="Shift code" />
                </FRow>
                <FRow label="Weekly Off">
                  <Sel value={str("weeklyoff")} onChange={set("weeklyoff")} placeholder="Select day">
                    {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Employee Location">
                  <TxtInput value={str("emplocation")} onChange={set("emplocation")} placeholder="Work location" maxLength={50} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: Contact & Address ────────────────────────────────── */}
          <TabsContent value="contact">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Local / Current Address</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Address Line 1">
                    <TxtInput value={str("localadd1")} onChange={set("localadd1")} placeholder="Local address 1" maxLength={200} />
                  </FRow>
                  <FRow label="Address Line 2">
                    <TxtInput value={str("localadd2")} onChange={set("localadd2")} placeholder="Local address 2" maxLength={200} />
                  </FRow>
                  <FRow label="Contact No">
                    <TxtInput value={str("contnolocal")} onChange={set("contnolocal")} placeholder="Local contact no." maxLength={50} />
                  </FRow>
                  <FRow label="PIN Code">
                    <TxtInput value={str("localpin")} onChange={set("localpin")} placeholder="PIN" maxLength={50} />
                  </FRow>
                  <FRow label="State">
                    <TxtInput value={str("LOCALSTATE")} onChange={set("LOCALSTATE")} placeholder="State" maxLength={20} />
                  </FRow>
                  <FRow label="District">
                    <TxtInput value={str("localDist")} onChange={set("localDist")} placeholder="District" maxLength={30} />
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Permanent Address</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Address Line 1">
                    <TxtInput value={str("addref1")} onChange={set("addref1")} placeholder="Permanent address 1" maxLength={50} />
                  </FRow>
                  <FRow label="Address Line 2">
                    <TxtInput value={str("addref2")} onChange={set("addref2")} placeholder="Permanent address 2" maxLength={50} />
                  </FRow>
                  <FRow label="Contact No">
                    <TxtInput value={str("contnoref")} onChange={set("contnoref")} placeholder="Permanent contact no." maxLength={50} />
                  </FRow>
                  <FRow label="State">
                    <TxtInput value={str("PERMANENTSTATE")} onChange={set("PERMANENTSTATE")} placeholder="State" maxLength={20} />
                  </FRow>
                  <FRow label="District">
                    <TxtInput value={str("permanentDist")} onChange={set("permanentDist")} placeholder="District" maxLength={30} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 4: Bank & Payment ───────────────────────────────────── */}
          <TabsContent value="bank">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bank &amp; Payment Details</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Bank Code">
                  <TxtInput value={str("bankcode")} onChange={set("bankcode")} placeholder="Bank code" maxLength={10} />
                </FRow>
                <FRow label="Name in Bank" error={errors.NameInBank}>
                  <TxtInput value={str("NameInBank")} onChange={set("NameInBank")} placeholder="Name as in bank records" maxLength={50} />
                </FRow>
                <FRow label="Bank Branch Name">
                  <TxtInput value={str("BankBranchName")} onChange={set("BankBranchName")} placeholder="Bank branch" maxLength={50} />
                </FRow>
                <FRow label="Account Number" error={errors.acno}
                      required={bankPayment} hint="Keep blank if mode is Cash">
                  <TxtInput value={str("acno")} onChange={(v) => { set("acno")(v); set("isAcctVarify")("0"); set("VerifiedBeneficiaryName")(""); }} placeholder="Bank account number" maxLength={25} />
                </FRow>
                <FRow label="IFSC Code" error={errors.SavingIFSCCode}
                      required={bankPayment} hint="Format: ABCD0123456">
                  <TxtInput value={str("SavingIFSCCode")} onChange={(v) => { set("SavingIFSCCode")(v.toUpperCase()); set("isAcctVarify")("0"); set("VerifiedBeneficiaryName")(""); }}
                             placeholder="SBIN0001234" maxLength={50} />
                </FRow>
                <FRow label="MICR Code">
                  <TxtInput value={str("MICRCode")} onChange={set("MICRCode")} placeholder="MICR" maxLength={50} />
                </FRow>
                <FRow label="Bank Verification" hint={!isEdit ? "Save the employee first, then verify the bank account." : "Penniless verification does not credit ₹1 to the beneficiary account."}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleBankVerification}
                      disabled={verifyingBank || !isEdit || !str("acno").trim() || !str("SavingIFSCCode").trim()}>
                      {verifyingBank ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {verifyingBank ? "Verifying…" : "Verify Bank Account"}
                    </Button>
                    {Number(form.isAcctVarify) === 1 ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Verified</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><XCircle className="h-4 w-4" /> Not verified</span>
                    )}
                  </div>
                </FRow>
                <FRow label="Verified Beneficiary Name">
                  <TxtInput value={str("VerifiedBeneficiaryName")} onChange={() => {}}
                             placeholder="Returned by bank verification" maxLength={100} disabled readOnly />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 5: PF / ESI / Statutory ────────────────────────────── */}
          <TabsContent value="statutory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Identity Numbers (Sensitive)</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="PAN No" hint="Format: AAAAA9999A" error={errors.PAN_no}>
                    <TxtInput value={str("PAN_no")} onChange={(v) => set("PAN_no")(v.toUpperCase())}
                               placeholder="ABCDE1234F" maxLength={50} />
                  </FRow>
                  <FRow label="Aadhaar No" hint="12 digits" error={errors.adharcardno}>
                    <TxtInput value={str("adharcardno")} onChange={set("adharcardno")}
                               placeholder="123456789012" maxLength={50} />
                  </FRow>
                  <FRow label="UAN No" hint="12 digits" error={errors.UANNo}>
                    <TxtInput value={str("UANNo")} onChange={set("UANNo")}
                               placeholder="100000000001" maxLength={50} />
                  </FRow>
                  <FRow label="Name on Aadhaar">
                    <TxtInput value={str("NameOnAdhar")} onChange={set("NameOnAdhar")} maxLength={50} />
                  </FRow>
                  <FRow label="Name on PAN">
                    <TxtInput value={str("NameOnPAN")} onChange={set("NameOnPAN")} maxLength={50} />
                  </FRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Provident Fund</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="PF Applicable">
                    <Sel value={str("APPLICABLE")} onChange={set("APPLICABLE")} placeholder="Select">
                      <SelectItem value="True">Yes — True</SelectItem>
                      <SelectItem value="False">No — False</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF Employee (₹)" hint={pfApplicable ? "Required when PF applicable" : ""}>
                    <NumInput value={num("pf")} onChange={set("pf")} placeholder="0.00" />
                  </FRow>
                  <FRow label="VPF (₹)">
                    <NumInput value={num("VPF")} onChange={set("VPF")} placeholder="0.00" />
                  </FRow>
                  <FRow label="VPF Rate (%)">
                    <NumInput value={num("VPFRate")} onChange={set("VPFRate")} placeholder="0" />
                  </FRow>
                  <FRow label="PF Wage Eligibility">
                    <Sel value={str("PFWageEligibility")} onChange={set("PFWageEligibility")} placeholder="Select">
                      <SelectItem value="True">Eligible</SelectItem>
                      <SelectItem value="False">Not Eligible</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF Limit (₹)">
                    <NumInput value={num("PFLimit")} onChange={set("PFLimit")} placeholder="15000" />
                  </FRow>
                  <FRow label="Is Pension">
                    <Sel value={str("IsPension")} onChange={set("IsPension")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF on Full Salary">
                    <Sel value={num("IsPFonFull")} onChange={set("IsPFonFull")} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem>
                      <SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF Date">
                    <DateInput value={str("pfDate")} onChange={set("pfDate")} />
                  </FRow>
                  <FRow label="Is ABRY" hint="Atmanirbhar Bharat scheme">
                    <Sel value={str("IsAbry")} onChange={set("IsAbry")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF Bank A/c">
                    <TxtInput value={str("PFBanAcc")} onChange={set("PFBanAcc")} placeholder="PF bank account" maxLength={50} />
                  </FRow>
                  <FRow label="PF Bank IFSC" error={errors.PFBankIFSC}>
                    <TxtInput value={str("PFBankIFSC")} onChange={(v) => set("PFBankIFSC")(v.toUpperCase())}
                               placeholder="SBIN0001234" maxLength={50} />
                  </FRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ESI</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="ESI Token No" hint="ESI member / card number">
                    <TxtInput value={str("tokanno")} onChange={set("tokanno")} placeholder="ESI token number" maxLength={25} />
                  </FRow>
                  <FRow label="ESI Employee (₹)">
                    <NumInput value={num("esi")} onChange={set("esi")} placeholder="0.00" />
                  </FRow>
                  <FRow label="ESI Limit (₹)">
                    <NumInput value={num("ESILimit")} onChange={set("ESILimit")} placeholder="21000" />
                  </FRow>
                  <FRow label="ESI Date">
                    <DateInput value={str("EsiDate")} onChange={set("EsiDate")} />
                  </FRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">PT &amp; LWF</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="P-Tax Applicable">
                    <Sel value={str("IsPtax")} onChange={set("IsPtax")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="P-Tax (₹)">
                    <NumInput value={num("PTax")} onChange={set("PTax")} placeholder="0.00" />
                  </FRow>
                  <FRow label="PT Date">
                    <DateInput value={str("PTaxDate")} onChange={set("PTaxDate")} />
                  </FRow>
                  <FRow label="LWF Applicable">
                    <Sel value={str("IsLWF")} onChange={set("IsLWF")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="LWF ID">
                    <TxtInput value={str("LWFID")} onChange={set("LWFID")} placeholder="LWF member ID" maxLength={50} />
                  </FRow>
                  <FRow label="LWF Date">
                    <DateInput value={str("LwfDate")} onChange={set("LwfDate")} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 6: Salary & Allowances ──────────────────────────────── */}
          <TabsContent value="salary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Core Salary</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Basic (₹)">
                    <NumInput value={num("basic")} onChange={set("basic")} />
                  </FRow>
                  <FRow label="HRA (₹)">
                    <NumInput value={num("hra")} onChange={set("hra")} />
                  </FRow>
                  <FRow label="HRA % (auto-calc basis)">
                    <NumInput value={num("HRAper")} onChange={set("HRAper")} />
                  </FRow>
                  <FRow label="VDA (₹)">
                    <NumInput value={num("vda")} onChange={set("vda")} />
                  </FRow>
                  <FRow label="Conveyance (₹)">
                    <NumInput value={num("conv")} onChange={set("conv")} />
                  </FRow>
                  <FRow label="CCA (₹)">
                    <NumInput value={num("cca")} onChange={set("cca")} />
                  </FRow>
                  <FRow label="CEA (₹)">
                    <NumInput value={num("cea")} onChange={set("cea")} />
                  </FRow>
                  <FRow label="Washing (₹)">
                    <NumInput value={num("washall")} onChange={set("washall")} />
                  </FRow>
                  <FRow label="Medical (₹)">
                    <NumInput value={num("medical")} onChange={set("medical")} />
                  </FRow>
                  <FRow label="Special Allowance (₹)">
                    <NumInput value={num("specialAll")} onChange={set("specialAll")} />
                  </FRow>
                  <FRow label="LTA (₹)">
                    <NumInput value={num("LTA")} onChange={set("LTA")} />
                  </FRow>
                  <FRow label="Other Allowances (₹)">
                    <NumInput value={num("allowences")} onChange={set("allowences")} />
                  </FRow>
                  <FRow label="Gross (₹)">
                    <NumInput value={num("Gross")} onChange={set("Gross")} />
                  </FRow>
                  <FRow label="CTC (₹)">
                    <NumInput value={num("ctc")} onChange={set("ctc")} />
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Additional Allowances</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Education (₹)">
                    <NumInput value={num("EduAll")} onChange={set("EduAll")} />
                  </FRow>
                  <FRow label="Telephone (₹)">
                    <NumInput value={num("TelAll")} onChange={set("TelAll")} />
                  </FRow>
                  <FRow label="Food (₹)">
                    <NumInput value={num("foodAll")} onChange={set("foodAll")} />
                  </FRow>
                  <FRow label="Outdoor Staff (₹)">
                    <NumInput value={num("OutSAll")} onChange={set("OutSAll")} />
                  </FRow>
                  <FRow label="Night Shift (₹)">
                    <NumInput value={num("NightShiftAllow")} onChange={set("NightShiftAllow")} />
                  </FRow>
                  <FRow label="Attendance Reward (₹)">
                    <NumInput value={num("Att_Reward")} onChange={set("Att_Reward")} />
                  </FRow>
                  <FRow label="Daily Wages (₹)">
                    <NumInput value={num("dailywages")} onChange={set("dailywages")} />
                  </FRow>
                  <FRow label="Gross CTC (₹)">
                    <NumInput value={num("grossCTC")} onChange={set("grossCTC")} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 7: Leave & Overtime ─────────────────────────────────── */}
          <TabsContent value="leave">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leave &amp; Overtime</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Leave Applicable">
                  <Sel value={str("IsLeave")} onChange={set("IsLeave")} placeholder="Select">
                    <SelectItem value="True">Yes</SelectItem>
                    <SelectItem value="False">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Allow OT">
                  <Sel value={str("IsAllowOT")} onChange={set("IsAllowOT")} placeholder="Select">
                    <SelectItem value="True">Yes</SelectItem>
                    <SelectItem value="False">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Bonus Applicable">
                  <Sel value={str("IsBonus")} onChange={set("IsBonus")} placeholder="Select">
                    <SelectItem value="True">Yes</SelectItem>
                    <SelectItem value="False">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Bonus On" hint="e.g. Basic, Gross">
                  <TxtInput value={str("bonusOn")} onChange={set("bonusOn")} placeholder="Bonus basis" maxLength={50} />
                </FRow>
                <FRow label="Bonus Rate (%)">
                  <NumInput value={num("bonusRate")} onChange={set("bonusRate")} placeholder="8.33" />
                </FRow>
                <FRow label="Bonus Limit (₹)">
                  <NumInput value={num("bonusLimit")} onChange={set("bonusLimit")} placeholder="7000" />
                </FRow>
                <FRow label="Medical Eligibility">
                  <Sel value={str("medicalelig")} onChange={set("medicalelig")} placeholder="Select">
                    <SelectItem value="True">Eligible</SelectItem>
                    <SelectItem value="False">Not Eligible</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Emp Working Days">
                  <Input type="number" min="0" max="31" className="h-9" value={num("EmpMday")}
                         onChange={(e) => set("EmpMday")(e.target.value)} placeholder="26" />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 8: Documents & Verification ────────────────────────── */}
          <TabsContent value="documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Primary ID Proof</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="ID Proof Type">
                    <Sel value={str("IDProof")} onChange={set("IDProof")} placeholder="Select">
                      <SelectItem value="Aadhaar">Aadhaar Card</SelectItem>
                      <SelectItem value="Passport">Passport</SelectItem>
                      <SelectItem value="VoterID">Voter ID</SelectItem>
                      <SelectItem value="DrivingLicence">Driving Licence</SelectItem>
                      <SelectItem value="PAN">PAN Card</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="ID Proof Number">
                    <TxtInput value={str("IDProofNo")} onChange={set("IDProofNo")} placeholder="Document number" maxLength={50} />
                  </FRow>
                  <FRow label="ID Proof Name">
                    <TxtInput value={str("IDProofName")} onChange={set("IDProofName")} placeholder="Name on document" maxLength={50} />
                  </FRow>
                  <FRow label="ID Expiry Date">
                    <DateInput value={str("IDProofExpDate")} onChange={set("IDProofExpDate")} />
                  </FRow>
                  <FRow label="Voter ID No">
                    <TxtInput value={str("voterIDNo")} onChange={set("voterIDNo")} maxLength={20} />
                  </FRow>
                  <FRow label="Is KYC Done">
                    <Sel value={str("IsKYC")} onChange={set("IsKYC")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Additional Documents</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Doc 1 Type">
                    <TxtInput value={str("Doc1Type")} onChange={set("Doc1Type")} maxLength={50} />
                  </FRow>
                  <FRow label="Doc 1 Number">
                    <TxtInput value={str("Doc1No")} onChange={set("Doc1No")} maxLength={50} />
                  </FRow>
                  <FRow label="Doc 1 Name">
                    <TxtInput value={str("Doc1Name")} onChange={set("Doc1Name")} maxLength={50} />
                  </FRow>
                  <FRow label="Doc 2 Type">
                    <TxtInput value={str("Doc2Type")} onChange={set("Doc2Type")} maxLength={50} />
                  </FRow>
                  <FRow label="Doc 2 Number">
                    <TxtInput value={str("Doc2No")} onChange={set("Doc2No")} maxLength={50} />
                  </FRow>
                  <FRow label="Passport Issue Date">
                    <DateInput value={str("PIssueDate")} onChange={set("PIssueDate")} />
                  </FRow>
                  <FRow label="Passport Expiry Date">
                    <DateInput value={str("PValidDate")} onChange={set("PValidDate")} />
                  </FRow>
                  <FRow label="PSARA Training">
                    <TxtInput value={str("pSARA_Trng")} onChange={set("pSARA_Trng")} maxLength={50} />
                  </FRow>
                  <FRow label="PSARA Detail">
                    <TxtInput value={str("PSARA_Detail")} onChange={set("PSARA_Detail")} maxLength={50} />
                  </FRow>
                  <FRow label="Police Verification">
                    <TxtInput value={str("police_Vari")} onChange={set("police_Vari")} maxLength={50} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 9: Joining & Exit ───────────────────────────────────── */}
          <TabsContent value="joining">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Joining Details</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Date of Joining" required error={errors.DOJ}>
                    <DateInput value={str("DOJ")} onChange={set("DOJ")} />
                  </FRow>
                  <FRow label="Rel. Date of Joining">
                    <DateInput value={str("RDOJ")} onChange={set("RDOJ")} />
                  </FRow>
                  <FRow label="Application Date">
                    <DateInput value={str("applicationdate")} onChange={set("applicationdate")} />
                  </FRow>
                  <FRow label="Application No">
                    <TxtInput value={str("applicationno")} onChange={set("applicationno")} maxLength={25} />
                  </FRow>
                  <FRow label="Interview Date">
                    <DateInput value={str("interviewdate")} onChange={set("interviewdate")} />
                  </FRow>
                  <FRow label="Is Rejoin">
                    <Sel value={str("IsRejoin")} onChange={set("IsRejoin")} placeholder="Select">
                      <SelectItem value="True">Yes — Rejoining</SelectItem>
                      <SelectItem value="False">No — New Join</SelectItem>
                    </Sel>
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Exit / Separation
                    {!exitStatus && <span className="ml-2 text-xs font-normal text-muted-foreground">(set status to Left/Terminated to activate)</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Work Status" required error={errors.workstatus}>
                    <Sel value={str("workstatus")} onChange={set("workstatus")} placeholder="Select status">
                      <SelectItem value="A">Active (A)</SelectItem>
                      <SelectItem value="I">Inactive (I)</SelectItem>
                      <SelectItem value="L">Left (L)</SelectItem>
                      <SelectItem value="S">Suspended (S)</SelectItem>
                      <SelectItem value="T">Terminated (T)</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="Resignation Details" hint={exitStatus ? "Mandatory for exit status" : ""}>
                    <TxtInput value={str("resg_det")} onChange={set("resg_det")}
                               placeholder="Reason / remarks" maxLength={50} disabled={!exitStatus} />
                  </FRow>
                  <FRow label="PF Settlement">
                    <Sel value={str("IsPFSettlement")} onChange={set("IsPFSettlement")} placeholder="Select" disabled={!exitStatus}>
                      <SelectItem value="True">Yes — Settled</SelectItem>
                      <SelectItem value="False">No — Pending</SelectItem>
                    </Sel>
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 10: Advanced Legacy Fields ─────────────────────────── */}
          <TabsContent value="advanced">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Advanced / Legacy Fields
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (rarely edited — migrate from legacy data only)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Card No">
                  <TxtInput value={str("CardNo")} onChange={set("CardNo")} maxLength={25} />
                </FRow>
                <FRow label="Old Emp Code">
                  <TxtInput value={str("oldEmpcode")} onChange={set("oldEmpcode")} maxLength={50} />
                </FRow>
                <FRow label="Rope Code (ropcod)">
                  <TxtInput value={str("ropcod")} onChange={set("ropcod")} maxLength={50} />
                </FRow>
                <FRow label="Emp Dept Code">
                  <TxtInput value={str("EmpDeptCode")} onChange={set("EmpDeptCode")} maxLength={50} />
                </FRow>
                <FRow label="Zone Code">
                  <Input type="number" min="0" className="h-9" value={num("zonecode")}
                         onChange={(e) => set("zonecode")(e.target.value)} />
                </FRow>
                <FRow label="Location Code">
                  <Input type="number" min="0" className="h-9" value={num("locationcode")}
                         onChange={(e) => set("locationcode")(e.target.value)} />
                </FRow>
                <FRow label="FO Code">
                  <TxtInput value={str("focode")} onChange={set("focode")} maxLength={50} />
                </FRow>
                <FRow label="Saving Bank Name">
                  <TxtInput value={str("SavingBankName")} onChange={set("SavingBankName")} maxLength={50} />
                </FRow>
                <FRow label="Saving A/c No">
                  <TxtInput value={str("Savingacno")} onChange={set("Savingacno")} maxLength={50} />
                </FRow>
                <FRow label="Saving IFSC (duplicate)" hint="Alternate IFSC field">
                  <TxtInput value={str("SavingIFSCCode")} onChange={set("SavingIFSCCode")} maxLength={50} />
                </FRow>
                <FRow label="UAN Bank Name">
                  <TxtInput value={str("UANBankName")} onChange={set("UANBankName")} maxLength={50} />
                </FRow>
                <FRow label="UAN Bank A/c">
                  <TxtInput value={str("UANBankAcc")} onChange={set("UANBankAcc")} maxLength={50} />
                </FRow>
                <FRow label="UAN Bank IFSC">
                  <TxtInput value={str("UANBankIFSC")} onChange={set("UANBankIFSC")} maxLength={50} />
                </FRow>
                <FRow label="Update Reason">
                  <TxtInput value={str("updreason")} onChange={set("updreason")} maxLength={200} />
                </FRow>
                <FRow label="Misc Notes 1">
                  <TxtInput value={str("othdet1")} onChange={set("othdet1")} maxLength={50} />
                </FRow>
                <FRow label="Misc Notes 2">
                  <TxtInput value={str("othdet2")} onChange={set("othdet2")} maxLength={50} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Submit bar ────────────────────────────────────────────────── */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/50 px-4 py-3 flex items-center justify-between mt-4 -mx-6 rounded-b-none">
          <span className="text-xs text-muted-foreground">
            {isEdit ? `Editing ${empCode}` : "New Employee — EMPMAST"}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href={isEdit ? `/employees/${encodeURIComponent(empCode!)}` : "/employees"}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                : <><Save className="h-4 w-4 mr-2" /> {isEdit ? "Save Changes" : "Create Employee"}</>}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
