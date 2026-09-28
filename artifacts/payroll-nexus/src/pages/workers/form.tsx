/**
 * workers/form.tsx — Add / Edit Employee (EMPMAST)
 *
 * POST  /api/workers              (create — requires workers:write)
 * PATCH /api/workers/:EmpCode     (edit   — requires workers:write)
 *
 * Logical key: (compid, EmpCode) — EmpCode is NOT globally unique.
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
import { ArrowLeft, Save, Loader2, ShieldCheck, CheckCircle2, XCircle, Search, UserRoundCheck } from "lucide-react";
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
import { AadhaarDigilockerPanel, UanDigilockerPanel, type AadhaarDigilockerResult } from "./meon-digilocker";

const hdr = () => ({
  Authorization:  `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

// ── Shared UI helpers ─────────────────────────────────────────────────────────

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

function Sel({ value, onChange, placeholder, children, disabled, loading }: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
  children:    React.ReactNode;
  disabled?:   boolean;
  loading?:    boolean;
}) {
  return (
    <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)} disabled={disabled || loading}>
      <SelectTrigger className="h-9">
        {loading
          ? <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />Loading…
            </span>
          : <SelectValue placeholder={placeholder} />
        }
      </SelectTrigger>
      <SelectContent className="max-h-72 overflow-y-auto">
        <SelectItem value="_none">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function Txt({ value, onChange, placeholder = "", maxLength, ...rest }: {
  value:       string | number | null | undefined;
  onChange:    (v: string) => void;
  placeholder?: string;
  maxLength?:  number;
  [k: string]: unknown;
}) {
  return (
    <Input className="h-9" placeholder={placeholder} maxLength={maxLength}
      value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
  );
}

function Num({ value, onChange, placeholder = "0.00" }: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input type="number" min="0" step="0.01" className="h-9" placeholder={placeholder}
      value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  );
}

function DateIn({ value, onChange }: { value: string | null | undefined; onChange: (v: string) => void }) {
  const iso = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <Input type="date" className="h-9" value={iso}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")} />
  );
}

type FD = Record<string, string | number | null>;

type SalaryComponent = {
  key: string;
  label: string;
  field: string;
  sourceHead: number;
  sourceColumn: string;
  defaultValue: number | null;
};

type SalaryComponentConfig = {
  source: "UNITMASTER";
  unitcode: string;
  Unitname: string | null;
  configured: boolean;
  components: SalaryComponent[];
};

// Values for configured Client Master salary heads are stored slot-for-slot in
// EMPMAST.SalHead1..SalHead17. Legacy named amount fields are included only in
// the change warning so an old employee is never switched silently.
const CLIENT_SALARY_AMOUNT_FIELDS = Array.from({ length: 17 }, (_, i) => `SalHead${i + 1}`);
const LEGACY_SALARY_AMOUNT_FIELDS = [
  "basic","hra","vda","cca","cea","conv","washall","medical","specialAll",
  "LTA","allowences","othall","prodAll","EduAll","Gross","ctc","grossCTC",
  "dailywages",
];
const SALARY_AMOUNT_FIELDS = [...CLIENT_SALARY_AMOUNT_FIELDS, ...LEGACY_SALARY_AMOUNT_FIELDS];

function hasSalaryValues(form: FD): boolean {
  return SALARY_AMOUNT_FIELDS.some((field) => {
    const value = form[field];
    return value != null && String(value).trim() !== "" && Number(value) !== 0;
  });
}

interface Props { params: { EmpCode?: string } }

export default function WorkerFormPage({ params }: Props) {
  const empCode   = params.EmpCode ? decodeURIComponent(params.EmpCode) : null;
  const isEdit    = !!empCode;
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const [form,     setForm]     = useState<FD>({});
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState(false);
  const [verifyingBank, setVerifyingBank] = useState(false);
  const [verifyingUan, setVerifyingUan] = useState(false);
  const [verifyingEsic, setVerifyingEsic] = useState(false);
  const [uanStatus, setUanStatus] = useState<"VERIFIED"|"FAILED"|null>(null);
  const [esicStatus, setEsicStatus] = useState<"VERIFIED"|"FAILED"|null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [rejoinEmpCode, setRejoinEmpCode] = useState("");
  const [checkingRejoin, setCheckingRejoin] = useState(false);
  const [rejoinMatch, setRejoinMatch] = useState<{ previousEmpCode: string; EmpName?: string; workstatus?: string; exitDate?: string | null } | null>(null);
  const [clearSalaryAfterClientChange, setClearSalaryAfterClientChange] = useState(false);

  // Load existing row for edit
  const { data: existing, isLoading: loadingEmp } = useQuery<Record<string, unknown>>({
    queryKey: ["worker-edit", empCode],
    queryFn:  () =>
      fetch(`/api/workers/${encodeURIComponent(empCode!)}`, { headers: hdr() }).then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing && !("error" in existing)) {
      const clean: FD = {};
      for (const [k, v] of Object.entries(existing)) {
        clean[k] = v == null ? null : (typeof v === "object" ? null : v as string | number);
      }
      setForm(clean);
    }
  }, [existing]);

  // Onboarding hierarchy: Company / Entity → Client (UNITMASTER) → Department → Designation
  const selectedCompid = form.compid   ? String(form.compid)   : "";
  const selectedClient = form.unitcode ? String(form.unitcode) : "";

  // ── Companies ── scoped: HR Manager sees only assigned companies; Admin/PM see all
  const { data: companies = [], isLoading: companiesLoading } =
    useQuery<{ compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string }[]>({
      queryKey: ["scoped/companies"],
      queryFn:  () =>
        fetch("/api/scoped/companies", { headers: hdr() }).then((r) => r.json()),
      staleTime: 300_000,
    });

  // Auto-select company when exactly one is available
  useEffect(() => {
    if (companies.length === 1 && !selectedCompid && !isEdit) {
      setForm((f) => ({ ...f, compid: companies[0].compid }));
    }
  }, [companies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clients ── business "Client" records are stored in UNITMASTER.
  // No Branch or separate CLIENTMASTER step is used in employee onboarding.
  const { data: clients = [], isLoading: clientsLoading, isFetching: clientsFetching } =
    useQuery<{ unitcode: string; Unitname: string }[]>({
      queryKey: ["onboarding-clients", selectedCompid],
      queryFn:  () =>
        fetch(
          `/api/scoped/units?compid=${encodeURIComponent(selectedCompid)}`,
          { headers: hdr() }
        ).then((r) => r.json()),
      enabled: !!selectedCompid,
      staleTime: 120_000,
    });

  // Auto-select client when exactly one exists for the selected company
  useEffect(() => {
    if (clients.length === 1 && !selectedClient && selectedCompid && !isEdit) {
      setForm((f) => ({ ...f, unitcode: clients[0].unitcode, branchcode: null, clientcode: null }));
    }
  }, [clients, selectedCompid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salary-component structure follows the selected Client (UNITMASTER).
  // The endpoint reads the LIVE Client Master row from the database and maps
  // salary head N directly to EMPMAST.SalHeadN. No label-based guessing.
  const { data: salaryConfig, isLoading: salaryConfigLoading } =
    useQuery<SalaryComponentConfig>({
      queryKey: ["unit-salary-components", selectedClient],
      queryFn: async () => {
        const r = await fetch(
          `/api/scoped/units/${encodeURIComponent(selectedClient)}/salary-components`,
          { headers: hdr() },
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Could not load salary components");
        return data;
      },
      enabled: !!selectedClient,
      staleTime: 120_000,
    });

  // Only clear obsolete amounts after HR explicitly changes client context.
  // Opening an existing employee for edit never destroys hidden legacy values.
  useEffect(() => {
    if (!salaryConfig) return;

    setForm((current) => {
      const next = { ...current };

      if (clearSalaryAfterClientChange) {
        // A deliberate Client change starts from the new Client's configured defaults.
        for (const field of CLIENT_SALARY_AMOUNT_FIELDS) next[field] = null;
        for (const component of salaryConfig.components) {
          next[component.field] = component.defaultValue;
        }
        return next;
      }

      if (!isEdit) {
        // New Employee: prefill configured Client defaults, but never overwrite a
        // value HR has already typed manually.
        for (const component of salaryConfig.components) {
          const existing = next[component.field];
          if ((existing == null || String(existing).trim() === "") && component.defaultValue != null) {
            next[component.field] = component.defaultValue;
          }
        }
      }

      return next;
    });

    if (clearSalaryAfterClientChange) setClearSalaryAfterClientChange(false);
  }, [salaryConfig, clearSalaryAfterClientChange, isEdit]);

  // ── Departments ── global master; any department can be used for any client
  const { data: departments = [], isLoading: deptsLoading } =
    useQuery<{ deptcode: string; Deptname: string }[]>({
      queryKey: ["masters/departments"],
      queryFn:  () => fetch("/api/masters/departments", { headers: hdr() }).then((r) => r.json()),
      staleTime: 300_000,
    });

  // ── Shared classification masters ── load unconditionally
  const { data: designations = [] } = useQuery<{ DESICODE: number; DESINAME: string; is_active?: boolean }[]>({
    queryKey: ["designations"],
    queryFn:  () => fetch("/api/masters/designations", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: grades = [] } = useQuery<{ GradeCode: number; GradeName: string }[]>({
    queryKey: ["grades"],
    queryFn:  () => fetch("/api/masters/grades", { headers: hdr() }).then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: categories = [] } = useQuery<{ catcode: string; catname: string }[]>({
    queryKey: ["categories", selectedCompid],
    queryFn:  () => {
      const qs = selectedCompid ? `?compid=${selectedCompid}` : "";
      return fetch(`/api/masters/categories${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 120_000,
  });

  const set = (key: string) => (val: string | number | null) =>
    setForm((f) => ({ ...f, [key]: val === "" ? null : val }));
  const str = (k: string): string => form[k] != null ? String(form[k]) : "";
  const num = (k: string): string => form[k] != null ? String(form[k]) : "";


  const pfApplicable = str("APPLICABLE").toLowerCase() === "true";
  const esiApplicable = ["1","true","yes"].includes(str("CHK_ESIMUST").toLowerCase());
  const bankPayment  = str("modeofpay").toLowerCase() === "bank";
  const exitStatus   = ["L","Left","T","Terminated","S","Suspended"].includes(str("workstatus"));

  async function handleRejoinCheck() {
    const code = rejoinEmpCode.trim();
    if (!code) {
      toast({ title: "Enter Employee ID", description: "Enter the employee's previous ID to check for a rejoinee.", variant: "destructive" });
      return;
    }

    setCheckingRejoin(true);
    setRejoinMatch(null);
    try {
      const resp = await fetch(`/api/workers/rejoin-check?empCode=${encodeURIComponent(code)}`, { headers: hdr() });
      const data = await resp.json();
      if (!resp.ok) throw new Error((data as any).error ?? "Could not check employee");

      if (!(data as any).found) {
        toast({ title: "No previous employee found", description: "Continue with normal new-employee onboarding." });
        return;
      }

      if ((data as any).active || !(data as any).isRejoinee) {
        const e = (data as any).employee ?? {};
        setRejoinMatch({ previousEmpCode: String((data as any).previousEmpCode ?? code), EmpName: e.EmpName, workstatus: e.workstatus, exitDate: (data as any).exitDate ?? null });
        toast({ title: "Not eligible as a rejoinee", description: `${e.EmpName ?? code} does not have confirmed separation evidence. Rejoinee details were not loaded.`, variant: "destructive" });
        return;
      }

      const old = (data as any).employee as Record<string, unknown>;
      // These fields describe the old employment period/current assignment and
      // must be freshly selected for the new joining. The old Employee Code is
      // preserved only as oldEmpcode; the new joining must use a different code.
      const freshFields = new Set([
        "EmpCode", "compid", "clientcode", "unitcode", "branchcode", "deptcode", "designation", "GradeCode", "catcode",
        "DOJ", "RDOJ", "workstatus", "DOL", "LeavingDate", "ResignDate", "RelievingDate", "LastWorkingDate",
        "basic", "hra", "vda", "conv", "Gross", "ctc", "salary", "BasicSalary",
        "RecordInsertByUserID", "RecordInsertDate", "RecordUpdateByUserID", "RecordUpdateDate", "ID", "SrNo"
      ]);
      setForm((current) => {
        const next: FD = { ...current };
        for (const [k, v] of Object.entries(old)) {
          if (freshFields.has(k) || v == null || typeof v === "object") continue;
          next[k] = v as string | number;
        }
        // Force employment-period fields to be entered again for this joining.
        for (const k of ["compid", "clientcode", "unitcode", "branchcode", "deptcode", "designation", "GradeCode", "catcode", "DOJ", "RDOJ", "workstatus"]) next[k] = null;
        next.oldEmpcode = String(old.EmpCode ?? code);
        next.IsRejoin = 1;
        if (String(next.EmpCode ?? "").trim().toLowerCase() === String(old.EmpCode ?? code).trim().toLowerCase()) {
          next.EmpCode = null;
        }
        // Never inherit verification proof/state from the old joining.
        next.isAcctVarify = 0;
        next.VerifiedBeneficiaryName = null;
        next.bankVerificationToken = null;
        return next;
      });
      setRejoinMatch({ previousEmpCode: String((data as any).previousEmpCode ?? code), EmpName: String(old.EmpName ?? ""), workstatus: String(old.workstatus ?? ""), exitDate: (data as any).exitDate ?? null });
      setActiveTab("basic");
      toast({ title: "Rejoinee found — details loaded", description: `${old.EmpName ?? code}. Enter a new Employee Code and fresh employment details.` });
    } catch (err) {
      toast({ title: "Rejoinee check failed", description: err instanceof Error ? err.message : "Unable to check employee", variant: "destructive" });
    } finally {
      setCheckingRejoin(false);
    }
  }

  async function handleBankVerification() {
    const accountNumber = str("acno").trim();
    const ifsc = str("SavingIFSCCode").trim().toUpperCase();
    const nameInBank = str("NameInBank").trim();

    if (!nameInBank || !accountNumber || !ifsc) {
      toast({
        title: "Bank details required",
        description: "Enter Name in Bank, Account Number and IFSC before verification.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCompid) {
      toast({
        title: "Company required",
        description: "Select the employee company before bank verification.",
        variant: "destructive",
      });
      return;
    }

    setVerifyingBank(true);
    try {
      let resp: Response;

      if (isEdit && empCode) {
        // Existing employee: persist any changed bank details first, then let the
        // server verify the stored EMPMAST values.
        const currentAccount = String((existing as any)?.acno ?? "").trim();
        const currentIfsc = String((existing as any)?.SavingIFSCCode ?? "").trim().toUpperCase();
        const currentName = String((existing as any)?.NameInBank ?? "").trim();
        if (accountNumber !== currentAccount || ifsc !== currentIfsc || nameInBank !== currentName) {
          const saveResp = await fetch(`/api/workers/${encodeURIComponent(empCode)}`, {
            method: "PATCH",
            headers: hdr(),
            body: JSON.stringify({ acno: accountNumber, SavingIFSCCode: ifsc, NameInBank: nameInBank }),
          });
          const saveData = await saveResp.json();
          if (!saveResp.ok) throw new Error((saveData as any).error ?? "Could not save bank details");
        }

        resp = await fetch(`/api/workers/${encodeURIComponent(empCode)}/bank/verify-penniless`, {
          method: "POST",
          headers: hdr(),
          body: JSON.stringify({}),
        });
      } else {
        // New employee: verify immediately without creating EMPMAST first.
        resp = await fetch("/api/workers/bank/verify-penniless", {
          method: "POST",
          headers: hdr(),
          body: JSON.stringify({
            accountNumber,
            ifsc,
            nameInBank,
            compid: selectedCompid,
            unitcode: selectedClient || undefined,
          }),
        });
      }

      const data = await resp.json();
      if (!resp.ok) throw new Error((data as any).error ?? "Bank verification failed");

      setForm((f) => ({
        ...f,
        isAcctVarify: (data as any).verified ? 1 : 0,
        VerifiedBeneficiaryName: (data as any).beneficiaryName ?? "",
        bankVerificationToken: !isEdit && (data as any).verified
          ? ((data as any).bankVerificationToken ?? "")
          : null,
      }));

      if ((data as any).verified) {
        toast({
          title: "Bank account verified",
          description: (data as any).beneficiaryName
            ? `Beneficiary: ${(data as any).beneficiaryName}`
            : "Account exists and is active.",
        });
      } else {
        toast({
          title: "Bank account not verified",
          description: "The provider could not confirm this account.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setForm((f) => ({ ...f, isAcctVarify: 0, VerifiedBeneficiaryName: "", bankVerificationToken: null }));
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Unable to verify bank account",
        variant: "destructive",
      });
    } finally {
      setVerifyingBank(false);
    }
  }

  async function handleStatutoryVerification(kind: "uan" | "esic") {
    const isUan = kind === "uan";
    const value = str(isUan ? "UANNo" : "tokanno").replace(/\s/g, "");
    const expected = isUan ? 12 : 10;
    if (!new RegExp(`^\\d{${expected}}$`).test(value)) {
      toast({ title: `${isUan ? "UAN" : "ESIC/IP"} number required`, description: `Enter exactly ${expected} digits before verification.`, variant: "destructive" }); return;
    }
    if (!str("EmpName").trim() || !selectedCompid) {
      toast({ title: "Employee details required", description: "Enter employee name and select company before verification.", variant: "destructive" }); return;
    }
    (isUan ? setVerifyingUan : setVerifyingEsic)(true);
    try {
      const resp = await fetch("/api/workers/statutory/verify", { method:"POST", headers:hdr(), body:JSON.stringify({ kind, value, employeeName:str("EmpName").trim(), fatherName:str("FHName").trim(), contactNumber:(str("contnolocal") || str("contnoref")).trim(), dob:str("DOB").trim(), compid:selectedCompid, unitcode:selectedClient || undefined }) });
      const data = await resp.json(); if(!resp.ok) throw new Error((data as any).error ?? "Verification failed");
      if ((data as any).verified) {
        setForm(f=>({...f,[isUan?"uanVerificationToken":"esicVerificationToken"]:(data as any).verificationToken}));
        (isUan ? setUanStatus : setEsicStatus)("VERIFIED");
        toast({ title:`${isUan?"UAN":"ESIC/IP"} verified`, description:(data as any).message ?? `Reference: ${(data as any).referenceId}` });
      } else {
        setForm(f=>({...f,[isUan?"uanVerificationToken":"esicVerificationToken"]:null}));
        (isUan ? setUanStatus : setEsicStatus)("FAILED");
        toast({ title:`${isUan?"UAN":"ESIC/IP"} not verified`, description:(data as any).message ?? "Provider could not confirm this number.", variant:"destructive" });
      }
    } catch(e) {
      (isUan ? setUanStatus : setEsicStatus)("FAILED");
      toast({ title:"Verification failed", description:e instanceof Error?e.message:"Unable to verify", variant:"destructive" });
    } finally { (isUan ? setVerifyingUan : setVerifyingEsic)(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Client-side quick validation
    const err: Record<string, string> = {};
    if (!isEdit && !str("EmpCode").trim())  err.EmpCode    = "Required";
    if (!str("EmpName").trim())             err.EmpName    = "Required";
    if (!str("compid"))                     err.compid     = "Required";
    if (!str("DOJ"))                        err.DOJ        = "Required";
    if (!str("workstatus"))                 err.workstatus = "Required";
    if (bankPayment && !str("NameInBank").trim())     err.NameInBank     = "Required for Bank payment";
    if (bankPayment && !str("acno").trim())           err.acno           = "Required for Bank payment";
    if (bankPayment && !str("SavingIFSCCode").trim()) err.SavingIFSCCode = "Required for Bank payment";
    if (pfApplicable && !str("UANNo").trim())           err.UANNo          = "Required when PF applicable";
    if (pfApplicable && uanStatus !== "VERIFIED")        err.UANNo          = "Verify UAN before saving";
    if (esiApplicable && !str("tokanno").trim())         err.tokanno        = "Required when ESI applicable";
    if (esiApplicable && esicStatus !== "VERIFIED")      err.tokanno        = "Verify ESIC/IP number before saving";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      // Jump to first tab with an error
      if (err.EmpCode || err.EmpName)     setActiveTab("basic");
      else if (err.compid || err.DOJ || err.workstatus) setActiveTab("employment");
      else if (err.NameInBank || err.acno || err.SavingIFSCCode) setActiveTab("bank");
      else if (err.UANNo || err.tokanno) setActiveTab("statutory");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== null && v !== "") payload[k] = v;
    }

    const url    = isEdit ? `/api/workers/${encodeURIComponent(empCode!)}` : "/api/workers";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const resp = await fetch(url, { method, headers: hdr(), body: JSON.stringify(payload) });
      const data = await resp.json();

      if (resp.ok) {
        const code = (data as any).EmpCode ?? empCode ?? str("EmpCode");
        toast({ title: isEdit ? "Employee updated" : "Employee created", description: `EmpCode: ${code}` });
        navigate(`/workers/${encodeURIComponent(code)}`);
      } else {
        const msg = (data as any).error ?? "An unexpected error occurred";
        setErrors({ _form: msg });
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } catch {
      setErrors({ _form: "Network error — please try again" });
      toast({ title: "Error", description: "Network error — please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && loadingEmp)
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading employee…</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={isEdit ? `/workers/${encodeURIComponent(empCode!)}` : "/workers"}>
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

      {!isEdit && (
        <Card className="border-primary/20 bg-muted/20">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <UserRoundCheck className="h-5 w-5 mt-0.5 text-primary" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-medium text-sm">Check if this employee is a rejoinee</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter the previous Employee ID. If an inactive/left employee is found, personal, KYC, contact, bank and statutory details are loaded automatically. Current assignment and joining details stay blank.</p>
                </div>
                <div className="flex gap-2 max-w-xl">
                  <Input
                    value={rejoinEmpCode}
                    onChange={(e) => setRejoinEmpCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleRejoinCheck(); } }}
                    placeholder="Previous Employee ID"
                    className="h-9"
                  />
                  <Button type="button" variant="outline" onClick={handleRejoinCheck} disabled={checkingRejoin}>
                    {checkingRejoin ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    Check Rejoinee
                  </Button>
                </div>
                {rejoinMatch && (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs">
                    <span className="font-medium">Previous record:</span> {rejoinMatch.previousEmpCode}
                    {rejoinMatch.EmpName ? ` · ${rejoinMatch.EmpName}` : ""}
                    {rejoinMatch.workstatus ? ` · Status: ${rejoinMatch.workstatus}` : ""}
                    {rejoinMatch.exitDate ? ` · Exit date: ${rejoinMatch.exitDate}` : ""}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1 mb-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
            <TabsTrigger value="statutory">PF / ESI</TabsTrigger>
            <TabsTrigger value="salary">Salary</TabsTrigger>
            <TabsTrigger value="leave">Leave &amp; OT</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="joining">Joining &amp; Exit</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Basic Information ─────────────────────────────────── */}
          <TabsContent value="basic">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Employee Code" required error={errors.EmpCode}>
                  <Txt value={str("EmpCode")} onChange={set("EmpCode")} placeholder="e.g. EMP001"
                    maxLength={25} disabled={isEdit} />
                </FRow>
                <FRow label="Aadhaar Card Number" hint="Verify and fetch Aadhaar details securely through Meon DigiLocker.">
                  <div className="space-y-2">
                    <Txt value={str("adharcardno")} onChange={set("adharcardno")}
                      placeholder="Enter 12-digit Aadhaar number" maxLength={12} inputMode="numeric" autoComplete="off" />
                    <AadhaarDigilockerPanel onVerified={(d: AadhaarDigilockerResult) => {
                      const gender = /^f/i.test(d.gender) ? "F" : /^t/i.test(d.gender) ? "T" : /^m/i.test(d.gender) ? "M" : null;

                      // Aadhaar DOB is a calendar date, not a timestamp. Keep it date-only so
                      // timezone conversion can never move it to the previous/next day.
                      const normalizeAadhaarDob = (value: string): string | null => {
                        const raw = String(value ?? "").trim();
                        if (!raw) return null;

                        // YYYY-MM-DD (optionally followed by a time)
                        let m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
                        if (m) {
                          const [, y, mo, day] = m;
                          return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
                        }

                        // DD-MM-YYYY / DD/MM/YYYY
                        m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
                        if (m) {
                          const [, day, mo, y] = m;
                          return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
                        }

                        return null;
                      };

                      const dobDateOnly = normalizeAadhaarDob(d.dob);
                      const aadhaarDigits = String(d.aadhaarReference ?? "").replace(/\D/g, "");
                      const fullAadhaar = aadhaarDigits.length === 12 ? aadhaarDigits : null;
                      setForm((f) => ({
                        ...f,
                        adharcardno: fullAadhaar || f.adharcardno,
                        EmpName: d.name || f.EmpName,
                        NameOnAdhar: d.name || f.NameOnAdhar,
                        FHName: d.fatherName || f.FHName,
                        DOB: dobDateOnly || f.DOB,
                        Sex: gender || f.Sex,
                        Nationality: d.country || f.Nationality || "Indian",
                        addref1: (d.house || d.address || String(f.addref1 ?? "")).slice(0, 50) || f.addref1,
                        addref2: (d.locality || String(f.addref2 ?? "")).slice(0, 50) || f.addref2,
                        PERMANENTSTATE: d.state || f.PERMANENTSTATE,
                        permanentDist: d.district || f.permanentDist,
                        // Aadhaar/DigiLocker provides the PIN for the fetched address.
                        // Keep both address PIN fields populated by default; HR can still
                        // change the Local / Current PIN when the current address differs.
                        localpin: d.pincode || f.localpin,
                        permanentpin: d.pincode || f.permanentpin,
                      }));
                    }} />
                  </div>
                </FRow>
                <FRow label="Employee Name" required error={errors.EmpName}>
                  <Txt value={str("EmpName")} onChange={set("EmpName")} placeholder="Full name" maxLength={50} />
                </FRow>
                <FRow label="Father / Spouse Name">
                  <Txt value={str("FHName")} onChange={set("FHName")} placeholder="Father or spouse name" maxLength={50} />
                </FRow>
                <FRow label="F/H Indicator" hint="F = Father, S = Spouse">
                  <Sel value={str("cmbFH")} onChange={set("cmbFH")} placeholder="Select">
                    <SelectItem value="F">F — Father</SelectItem>
                    <SelectItem value="S">S — Spouse</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Mother Name">
                  <Txt value={str("mothername")} onChange={set("mothername")} placeholder="Mother's name" maxLength={50} />
                </FRow>
                <FRow label="Date of Birth">
                  <DateIn value={str("DOB")} onChange={set("DOB")} />
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
                  <Txt value={str("SpouseName")} onChange={set("SpouseName")} placeholder="Spouse name" maxLength={50} />
                </FRow>
                <FRow label="Children">
                  <Num value={num("children")} onChange={set("children")} placeholder="0" />
                </FRow>
                <FRow label="Blood Group">
                  <Sel value={str("BlodGroup")} onChange={set("BlodGroup")} placeholder="Select">
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Nationality">
                  <Txt value={str("Nationality")} onChange={set("Nationality")} placeholder="e.g. Indian" maxLength={50} />
                </FRow>
                <FRow label="Mobile" hint="10 digits" error={errors.MobNo}>
                  <Txt value={str("MobNo")} onChange={set("MobNo")} placeholder="9876543210" maxLength={50} />
                </FRow>
                <FRow label="Email" error={errors.emailID}>
                  <Txt value={str("emailID")} onChange={set("emailID")} placeholder="emp@example.com" maxLength={50} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Employment & Assignment ──────────────────────────── */}
          <TabsContent value="employment">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Employment &amp; Assignment</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                {/* ── Final onboarding hierarchy: Company → Client → Department → Designation ── */}
                <FRow label="Company / Entity" required error={errors.compid}>
                  <Sel
                    value={str("compid")}
                    onChange={(v) => {
                      if (v !== selectedCompid && selectedClient && hasSalaryValues(form)) {
                        const ok = window.confirm(
                          "Changing the company will also change the client salary structure. " +
                          "Salary amounts that are not part of the new client's configuration will be cleared after you select the new client. Continue?"
                        );
                        if (!ok) return;
                        setClearSalaryAfterClientChange(true);
                      }
                      // Client is backed by UNITMASTER; clear old legacy branch/client fields.
                      setForm((f) => ({
                        ...f,
                        compid: v === "" ? null : v,
                        branchcode: null,
                        clientcode: null,
                        unitcode: null,
                      }));
                    }}
                    placeholder="Select company / entity"
                    loading={companiesLoading}
                  >
                    {companies.length === 0 && !companiesLoading && (
                      <SelectItem value="_empty" disabled>No companies found</SelectItem>
                    )}
                    {companies.map((c) => (
                      <SelectItem key={c.compid} value={String(c.compid)}>{c.displayLabel ?? `${c.comname} — ID ${c.compid}`}</SelectItem>
                    ))}
                  </Sel>
                </FRow>

                <FRow label="Client" hint={!selectedCompid ? "Select a company / entity first" : "Client records are maintained in Client Master (UNITMASTER)."}>
                  <Sel
                    value={str("unitcode")}
                    onChange={(v) => {
                      if (v !== selectedClient && selectedClient && hasSalaryValues(form)) {
                        const ok = window.confirm(
                          "Changing the client will refresh the salary components. " +
                          "Amounts for components that do not exist in the new client configuration will be cleared. Continue?"
                        );
                        if (!ok) return;
                        setClearSalaryAfterClientChange(true);
                      }
                      setForm((f) => ({
                        ...f,
                        unitcode: v === "" ? null : v,
                        branchcode: null,
                        clientcode: null,
                      }));
                    }}
                    placeholder={selectedCompid ? "Select client" : "— select company first —"}
                    disabled={!selectedCompid}
                    loading={clientsLoading || clientsFetching}
                  >
                    {selectedCompid && clients.length === 0 && !clientsLoading && !clientsFetching && (
                      <SelectItem value="_empty" disabled>No clients found for this company</SelectItem>
                    )}
                    {clients.map((c) => (
                      <SelectItem key={c.unitcode} value={c.unitcode}>{c.Unitname} ({c.unitcode})</SelectItem>
                    ))}
                  </Sel>
                </FRow>

                <FRow label="Department">
                  <Sel
                    value={str("deptcode")}
                    onChange={set("deptcode")}
                    placeholder="Select department"
                    loading={deptsLoading}
                  >
                    {departments.length === 0 && !deptsLoading && (
                      <SelectItem value="_empty" disabled>No departments found</SelectItem>
                    )}
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
                  <DateIn value={str("DOJ")} onChange={set("DOJ")} />
                </FRow>
                <FRow label="Rel. Date of Joining" hint="Relative / rejoining date">
                  <DateIn value={str("RDOJ")} onChange={set("RDOJ")} />
                </FRow>
                <FRow label="Mode of Payment">
                  <Sel value={str("modeofpay")} onChange={set("modeofpay")} placeholder="Select mode">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Weekly Off">
                  <Sel value={str("weeklyoff")} onChange={set("weeklyoff")} placeholder="Select day">
                    {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </Sel>
                </FRow>
                <FRow label="Employee Location">
                  <Txt value={str("emplocation")} onChange={set("emplocation")} placeholder="Work location" maxLength={50} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: Contact & Address ─────────────────────────────────── */}
          <TabsContent value="contact">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Local / Current Address</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Address Line 1">
                    <Txt value={str("localadd1")} onChange={set("localadd1")} placeholder="Local address 1" maxLength={200} />
                  </FRow>
                  <FRow label="Address Line 2">
                    <Txt value={str("localadd2")} onChange={set("localadd2")} placeholder="Local address 2" maxLength={200} />
                  </FRow>
                  <FRow label="Contact No">
                    <Txt value={str("contnolocal")} onChange={set("contnolocal")} placeholder="Local contact" maxLength={50} />
                  </FRow>
                  <FRow label="PIN Code">
                    <Txt value={str("localpin")} onChange={(v) => set("localpin")(v.replace(/\D/g, "").slice(0, 6))} placeholder="PIN" maxLength={6} inputMode="numeric" />
                  </FRow>
                  <FRow label="State">
                    <Txt value={str("LOCALSTATE")} onChange={set("LOCALSTATE")} placeholder="State" maxLength={20} />
                  </FRow>
                  <FRow label="District">
                    <Txt value={str("localDist")} onChange={set("localDist")} placeholder="District" maxLength={30} />
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Permanent Address</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Address Line 1">
                    <Txt value={str("addref1")} onChange={set("addref1")} placeholder="Permanent address 1" maxLength={50} />
                  </FRow>
                  <FRow label="Address Line 2">
                    <Txt value={str("addref2")} onChange={set("addref2")} placeholder="Permanent address 2" maxLength={50} />
                  </FRow>
                  <FRow label="Contact No">
                    <Txt value={str("contnoref")} onChange={set("contnoref")} placeholder="Permanent contact" maxLength={50} />
                  </FRow>
                  <FRow label="PIN Code">
                    <Txt value={str("permanentpin")} onChange={(v) => set("permanentpin")(v.replace(/\D/g, "").slice(0, 6))} placeholder="PIN" maxLength={6} inputMode="numeric" />
                  </FRow>
                  <FRow label="State">
                    <Txt value={str("PERMANENTSTATE")} onChange={set("PERMANENTSTATE")} placeholder="State" maxLength={20} />
                  </FRow>
                  <FRow label="District">
                    <Txt value={str("permanentDist")} onChange={set("permanentDist")} placeholder="District" maxLength={30} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 4: Bank & Payment ────────────────────────────────────── */}
          <TabsContent value="bank">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bank &amp; Payment Details</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Bank Code">
                  <Txt value={str("bankcode")} onChange={set("bankcode")} placeholder="Bank code" maxLength={10} />
                </FRow>
                <FRow label="Name in Bank" error={errors.NameInBank} required={bankPayment}>
                  <Txt value={str("NameInBank")} onChange={(v) => { set("NameInBank")(v); set("isAcctVarify")("0"); set("VerifiedBeneficiaryName")(""); set("bankVerificationToken")(null); }} placeholder="Name as in bank records" maxLength={50} />
                </FRow>
                <FRow label="Bank Branch Name">
                  <Txt value={str("BankBranchName")} onChange={set("BankBranchName")} placeholder="Bank branch" maxLength={50} />
                </FRow>
                <FRow label="Account Number" error={errors.acno} required={bankPayment} hint="Leave blank for Cash mode">
                  <Txt value={str("acno")} onChange={(v) => { set("acno")(v); set("isAcctVarify")("0"); set("VerifiedBeneficiaryName")(""); set("bankVerificationToken")(null); }} placeholder="Bank account number" maxLength={25} />
                </FRow>
                <FRow label="IFSC Code" error={errors.SavingIFSCCode} required={bankPayment} hint="Format: SBIN0001234">
                  <Txt value={str("SavingIFSCCode")} onChange={(v) => { set("SavingIFSCCode")(v.toUpperCase()); set("isAcctVarify")("0"); set("VerifiedBeneficiaryName")(""); set("bankVerificationToken")(null); }}
                    placeholder="SBIN0001234" maxLength={50} />
                </FRow>
                <FRow label="MICR Code">
                  <Txt value={str("MICRCode")} onChange={set("MICRCode")} placeholder="MICR" maxLength={50} />
                </FRow>
                <FRow label="Bank Verification" hint="Verify the account before completing onboarding. Pennyless verification does not credit ₹1 to the beneficiary account.">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleBankVerification}
                      disabled={verifyingBank || !selectedCompid || !str("NameInBank").trim() || !str("acno").trim() || !str("SavingIFSCCode").trim()}>
                      {verifyingBank ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {verifyingBank ? "Verifying…" : "Verify Bank Account"}
                    </Button>
                    {Number(form.isAcctVarify) === 1 ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <XCircle className="h-4 w-4" /> Not verified
                      </span>
                    )}
                  </div>
                </FRow>
                <FRow label="Verified Beneficiary Name">
                  <Txt value={str("VerifiedBeneficiaryName")} onChange={() => {}}
                    placeholder="Returned by bank verification" maxLength={50} disabled readOnly />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 5: PF / ESI / Statutory ─────────────────────────────── */}
          <TabsContent value="statutory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Provident Fund</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="PF Applicable">
                    <Sel value={str("APPLICABLE")} onChange={set("APPLICABLE")} placeholder="Select">
                      <SelectItem value="True">Yes</SelectItem>
                      <SelectItem value="False">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="UAN No" required={pfApplicable} error={errors.UANNo} hint="12 digits — Meon DigiLocker UAN Card verification when PF is applicable">
                    <div className="flex gap-2">
                      <Txt value={str("UANNo")} onChange={(v)=>{set("UANNo")(v.replace(/\D/g, "").slice(0,12)); setUanStatus(null); set("uanVerificationToken")(null);}} placeholder="123456789012" maxLength={12} />
                      <Button type="button" variant="outline" disabled={verifyingUan || !pfApplicable} onClick={()=>handleStatutoryVerification("uan")}>
                        {verifyingUan?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>} Verify
                      </Button>
                    </div>
                    {uanStatus && <span className={`text-xs ${uanStatus==="VERIFIED"?"text-emerald-700":"text-destructive"}`}>{uanStatus==="VERIFIED"?"✓ UAN verified":"✕ UAN not verified"}</span>}
                    <UanDigilockerPanel uan={str("UANNo")} onFetched={(result) => {
                      // Do not mark VERIFIED until the first real sandbox response confirms
                      // Meon's exact UAN Card response fields and ownership/name mapping.
                      if (result?.success) setUanStatus(null);
                    }} />
                  </FRow>
                  <FRow label="PF Amount">
                    <Num value={num("pf")} onChange={set("pf")} />
                  </FRow>
                  <FRow label="VPF Rate (%)">
                    <Num value={num("VPFRate")} onChange={set("VPFRate")} />
                  </FRow>
                  <FRow label="PF Limit (₹)">
                    <Num value={num("PFLimit")} onChange={set("PFLimit")} />
                  </FRow>
                  <FRow label="Is Pension">
                    <Sel value={str("IsPension")} onChange={set("IsPension")} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem>
                      <SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PF Bank A/c">
                    <Txt value={str("PFBanAcc")} onChange={set("PFBanAcc")} placeholder="PF bank account" maxLength={25} />
                  </FRow>
                  <FRow label="PF Bank IFSC">
                    <Txt value={str("PFBankIFSC")} onChange={(v) => set("PFBankIFSC")(v.toUpperCase())}
                      placeholder="SBIN0001234" maxLength={11} />
                  </FRow>
                  <FRow label="PF Effective Date">
                    <DateIn value={str("pfDate")} onChange={set("pfDate")} />
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ESI &amp; Statutory IDs</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Aadhaar No" hint="12 digits — same Aadhaar number entered in Basic Info">
                    <Txt
                      value={str("adharcardno")}
                      onChange={(v) => set("adharcardno")(v.replace(/\D/g, "").slice(0, 12))}
                      placeholder="123456789012"
                      maxLength={12}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </FRow>
                  <FRow label="PAN No" hint="AAAAA9999A">
                    <Txt value={str("PAN_no")} onChange={(v) => set("PAN_no")(v.toUpperCase())}
                      placeholder="ABCDE1234F" maxLength={15} />
                  </FRow>
                  <FRow label="ESI Applicable">
                    <Sel value={str("CHK_ESIMUST")} onChange={(v)=>{set("CHK_ESIMUST")(v); if(v!=="1"){setEsicStatus(null); set("esicVerificationToken")(null);}}} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="ESIC / IP Number" required={esiApplicable} error={errors.tokanno} hint="10 digits — verification required when ESI is applicable">
                    <div className="flex gap-2">
                      <Txt value={str("tokanno")} onChange={(v)=>{set("tokanno")(v.replace(/\D/g, "").slice(0,10)); setEsicStatus(null); set("esicVerificationToken")(null);}} placeholder="1234567890" maxLength={10} />
                      <Button type="button" variant="outline" disabled={verifyingEsic || !esiApplicable} onClick={()=>handleStatutoryVerification("esic")}>
                        {verifyingEsic?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>} Verify
                      </Button>
                    </div>
                    {esicStatus && <span className={`text-xs ${esicStatus==="VERIFIED"?"text-emerald-700":"text-destructive"}`}>{esicStatus==="VERIFIED"?"✓ ESIC/IP verified":"✕ ESIC/IP not verified"}</span>}
                  </FRow>
                  <FRow label="ESI Wage (₹)">
                    <Num value={num("esi")} onChange={set("esi")} />
                  </FRow>
                  <FRow label="ESI Limit (₹)">
                    <Num value={num("ESILimit")} onChange={set("ESILimit")} />
                  </FRow>
                  <FRow label="ESI Effective Date">
                    <DateIn value={str("EsiDate")} onChange={set("EsiDate")} />
                  </FRow>
                  <FRow label="Is PT Applicable">
                    <Sel value={str("IsPtax")} onChange={set("IsPtax")} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem>
                      <SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PT Effective Date">
                    <DateIn value={str("PTaxDate")} onChange={set("PTaxDate")} />
                  </FRow>
                  <FRow label="Is LWF Applicable">
                    <Sel value={str("IsLWF")} onChange={set("IsLWF")} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem>
                      <SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="LWF Effective Date">
                    <DateIn value={str("LwfDate")} onChange={set("LwfDate")} />
                  </FRow>
                  <FRow label="Name on Aadhaar">
                    <Txt value={str("NameOnAdhar")} onChange={set("NameOnAdhar")} placeholder="As on Aadhaar" maxLength={50} />
                  </FRow>
                  <FRow label="Name on PAN">
                    <Txt value={str("NameOnPAN")} onChange={set("NameOnPAN")} placeholder="As on PAN" maxLength={50} />
                  </FRow>
                  <FRow label="Voter ID No">
                    <Txt value={str("voterIDNo")} onChange={set("voterIDNo")} placeholder="Voter ID" maxLength={25} />
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 6: Salary & Allowances ──────────────────────────────── */}
          <TabsContent value="salary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Client Salary Components</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {selectedClient
                      ? salaryConfigLoading
                        ? "Loading the selected client's salary structure…"
                        : salaryConfig?.configured
                          ? "Loaded from Client Master. Configured default values are prefilled for new Employees and can be adjusted if required."
                          : "No salary heads are configured for this client in Client Master (UNITMASTER)."
                      : "Select a client in Employment & Assignment to load its salary structure."}
                  </p>
                </CardHeader>
                <CardContent className="space-y-0">
                  {!selectedClient ? (
                    <div className="py-6 text-sm text-muted-foreground text-center">
                      No client selected.
                    </div>
                  ) : salaryConfigLoading ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading salary components…
                    </div>
                  ) : salaryConfig?.components?.length ? (
                    salaryConfig.components.map((component) => (
                      <FRow
                        key={`${component.field}-${component.key}`}
                        label={`${component.label} (₹)${component.defaultValue != null ? ` · Client default ${component.defaultValue}` : ""}`}
                      >
                        <Num value={num(component.field)} onChange={set(component.field)} />
                      </FRow>
                    ))
                  ) : (
                    <div className="py-6 text-sm text-muted-foreground text-center">
                      No salary components are configured for this client.
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Total &amp; CTC</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Gross (₹)">     <Num value={num("Gross")}    onChange={set("Gross")} /></FRow>
                  <FRow label="CTC (₹)">       <Num value={num("ctc")}      onChange={set("ctc")} /></FRow>
                  <FRow label="Gross CTC (₹)"> <Num value={num("grossCTC")} onChange={set("grossCTC")} /></FRow>
                  <FRow label="Daily Wages (₹)"><Num value={num("dailywages")} onChange={set("dailywages")} /></FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 7: Leave & Overtime ──────────────────────────────────── */}
          <TabsContent value="leave">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leave &amp; Overtime</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Allow Leave">
                  <Sel value={str("IsLeave")} onChange={set("IsLeave")} placeholder="Select">
                    <SelectItem value="1">Yes</SelectItem>
                    <SelectItem value="0">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Allow Overtime">
                  <Sel value={str("IsAllowOT")} onChange={set("IsAllowOT")} placeholder="Select">
                    <SelectItem value="1">Yes</SelectItem>
                    <SelectItem value="0">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Medical Eligible">
                  <Sel value={str("medicalelig")} onChange={set("medicalelig")} placeholder="Select">
                    <SelectItem value="1">Yes</SelectItem>
                    <SelectItem value="0">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Allow Bonus">
                  <Sel value={str("IsBonus")} onChange={set("IsBonus")} placeholder="Select">
                    <SelectItem value="1">Yes</SelectItem>
                    <SelectItem value="0">No</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Bonus Basis">
                  <Sel value={str("bonusOn")} onChange={set("bonusOn")} placeholder="Select">
                    <SelectItem value="Basic">Basic</SelectItem>
                    <SelectItem value="Gross">Gross</SelectItem>
                  </Sel>
                </FRow>
                <FRow label="Bonus Rate (%)">
                  <Num value={num("bonusRate")} onChange={set("bonusRate")} />
                </FRow>
                <FRow label="Bonus Limit (₹)">
                  <Num value={num("bonusLimit")} onChange={set("bonusLimit")} />
                </FRow>
                <FRow label="Monthly Days" hint="Working days per month">
                  <Num value={num("EmpMday")} onChange={set("EmpMday")} placeholder="26" />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 8: Documents & Verification ─────────────────────────── */}
          <TabsContent value="documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ID &amp; KYC</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="ID Proof Type">
                    <Txt value={str("IDProof")} onChange={set("IDProof")} placeholder="e.g. Passport" maxLength={20} />
                  </FRow>
                  <FRow label="ID Proof Number">
                    <Txt value={str("IDProofNo")} onChange={set("IDProofNo")} placeholder="ID number" maxLength={50} />
                  </FRow>
                  <FRow label="ID Proof Name">
                    <Txt value={str("IDProofName")} onChange={set("IDProofName")} placeholder="Name on ID" maxLength={50} />
                  </FRow>
                  <FRow label="ID Expiry Date">
                    <DateIn value={str("IDProofExpDate")} onChange={set("IDProofExpDate")} />
                  </FRow>
                  <FRow label="KYC Done">
                    <Sel value={str("IsKYC")} onChange={set("IsKYC")} placeholder="Select">
                      <SelectItem value="1">Yes</SelectItem>
                      <SelectItem value="0">No</SelectItem>
                    </Sel>
                  </FRow>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Supporting Documents</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <FRow label="Doc 1 Type">
                    <Txt value={str("Doc1Type")} onChange={set("Doc1Type")} placeholder="Document type" maxLength={20} />
                  </FRow>
                  <FRow label="Doc 1 Number">
                    <Txt value={str("Doc1No")} onChange={set("Doc1No")} placeholder="Document number" maxLength={25} />
                  </FRow>
                  <FRow label="Doc 1 Name">
                    <Txt value={str("Doc1Name")} onChange={set("Doc1Name")} placeholder="Holder name" maxLength={50} />
                  </FRow>
                  <FRow label="Doc 2 Type">
                    <Txt value={str("Doc2Type")} onChange={set("Doc2Type")} placeholder="Document type" maxLength={20} />
                  </FRow>
                  <FRow label="Doc 2 Number">
                    <Txt value={str("Doc2No")} onChange={set("Doc2No")} placeholder="Document number" maxLength={25} />
                  </FRow>
                  <FRow label="Police Verification">
                    <Sel value={str("police_Vari")} onChange={set("police_Vari")} placeholder="Select">
                      <SelectItem value="Y">Yes</SelectItem>
                      <SelectItem value="N">No</SelectItem>
                    </Sel>
                  </FRow>
                  <FRow label="PSARA Training">
                    <Sel value={str("pSARA_Trng")} onChange={set("pSARA_Trng")} placeholder="Select">
                      <SelectItem value="Y">Yes</SelectItem>
                      <SelectItem value="N">No</SelectItem>
                    </Sel>
                  </FRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 9: Joining & Exit ────────────────────────────────────── */}
          <TabsContent value="joining">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Joining &amp; Exit Details</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Application Date">
                  <DateIn value={str("applicationdate")} onChange={set("applicationdate")} />
                </FRow>
                <FRow label="Application No">
                  <Txt value={str("applicationno")} onChange={set("applicationno")} placeholder="Application number" maxLength={20} />
                </FRow>
                <FRow label="Interview Date">
                  <DateIn value={str("interviewdate")} onChange={set("interviewdate")} />
                </FRow>
                <FRow label="Is Rejoin">
                  <Sel value={str("IsRejoin")} onChange={set("IsRejoin")} placeholder="Select">
                    <SelectItem value="1">Yes</SelectItem>
                    <SelectItem value="0">No</SelectItem>
                  </Sel>
                </FRow>
                {exitStatus && (
                  <>
                    <FRow label="Reason for Leaving">
                      <Txt value={str("resg_det")} onChange={set("resg_det")} placeholder="Reason" maxLength={200} />
                    </FRow>
                    <FRow label="PF Settlement">
                      <Sel value={str("IsPFSettlement")} onChange={set("IsPFSettlement")} placeholder="Select">
                        <SelectItem value="1">Yes</SelectItem>
                        <SelectItem value="0">No</SelectItem>
                      </Sel>
                    </FRow>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 10: Advanced Legacy Fields ──────────────────────────── */}
          <TabsContent value="advanced">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Advanced / Legacy Fields</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <FRow label="Card No">
                  <Txt value={str("CardNo")} onChange={set("CardNo")} placeholder="Biometric card number" maxLength={20} />
                </FRow>
                <FRow label="Old Emp Code">
                  <Txt value={str("oldEmpcode")} onChange={set("oldEmpcode")} placeholder="Previous code" maxLength={25} />
                </FRow>
                <FRow label="UAN Bank Name">
                  <Txt value={str("UANBankName")} onChange={set("UANBankName")} placeholder="Bank name for UAN" maxLength={50} />
                </FRow>
                <FRow label="UAN Bank A/c">
                  <Txt value={str("UANBankAcc")} onChange={set("UANBankAcc")} placeholder="UAN bank account" maxLength={25} />
                </FRow>
                <FRow label="UAN Bank IFSC">
                  <Txt value={str("UANBankIFSC")} onChange={(v) => set("UANBankIFSC")(v.toUpperCase())}
                    placeholder="SBIN0001234" maxLength={11} />
                </FRow>
                <FRow label="Update Reason">
                  <Txt value={str("updreason")} onChange={set("updreason")} placeholder="Reason for update" maxLength={200} />
                </FRow>
                <FRow label="Other Details 1">
                  <Txt value={str("othdet1")} onChange={set("othdet1")} placeholder="Misc details" maxLength={200} />
                </FRow>
                <FRow label="Other Details 2">
                  <Txt value={str("othdet2")} onChange={set("othdet2")} placeholder="Misc details" maxLength={200} />
                </FRow>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Submit bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button asChild variant="outline">
            <Link href={isEdit ? `/workers/${encodeURIComponent(empCode!)}` : "/workers"}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={saving} className="min-w-32">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> {isEdit ? "Save Changes" : "Create Employee"}</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
