/**
 * Client Master — Create / Edit form
 *
 * Business label: Client. Technical storage: UNITMASTER.
 * Route: /clients/new              → POST  /api/units
 *        /clients/:unitcode/edit   → PATCH /api/units/:unitcode
 *
 * Writes only to UNITMASTER. Never touches SaaS tables.
 *
 * Form tabs:
 *   1. General Information
 *   2. Company / Entity Mapping
 *   3. Address & Contact
 *   4. Contract Details
 *   5. Attendance Configuration
 *   6. Payroll Configuration
 *   7. Compliance Configuration
 *   8. Billing Configuration
 *   9. Shift & Holiday Settings
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Save, ArrowLeft, Loader2 } from "lucide-react";
import { PageHeader }  from "@/components/ui/page-header";
import { Button }      from "@/components/ui/button";
import { Input }       from "@/components/ui/input";
import { Label }       from "@/components/ui/label";
import { Textarea }    from "@/components/ui/textarea";
import { useToast }    from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { params?: { unitcode?: string } }

const hdr = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

// ── Validation regexes ────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Company            { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }
interface Zone               { zonecode: number; zonename: string; }

interface UnitForm {
  // General
  Unitname: string;
  StateID: string;
  unitlocation: string;
  unittype: string;
  category: string;
  unitmanager: string;
  // Mapping
  compcode: string;
  clientcode: string;
  branchcode: string;
  zonecode: string;
  zonegroup: string;
  BillingZone: string;
  segcode: string;
  // Address
  address: string;
  city: string;
  state: string;
  pincode: string;
  telephone: string;
  email: string;
  // Contract
  contractdate: string;
  terminatedate: string;
  unitnote: string;
  billingname: string;
  billingadd: string;
  billadd1: string;
  billadd2: string;
  // Attendance
  monthDays: string;
  HrsPerDay: string;
  OT_Setting: string;
  OTpayMode: string;
  otmonthdays: string;
  monthDaysG: string;
  // Payroll
  PF_Setting: string;
  PF_OnEnc: string;
  EsiOnOT: string;
  wf: string;
  challan: string;
  salarylimit: string;
  pTax: string;
  // Compliance
  IsBonus: string;
  BonusOn: string;
  BonusRate: string;
  Bonus_Limit: string;
  IsGratuity: string;
  gratuityRate: string;
  gratuityDay: string;
  EMP_LWF: string;
  EMPR_LWF: string;
  LeaveAllRate: string;
  // Billing
  sCharge: string;
  sTax: string;
  CouponRate: string;
  UniformRate: string;
  rent: string;
  messamt: string;
  // Shifts
  SeperateOT: string;
  chknShift: string;
  // Client salary component labels + default employee values
  SalHead1: string; SalHead2: string; SalHead3: string; SalHead4: string; SalHead5: string;
  SalHead6: string; SalHead7: string; SalHead8: string; SalHead9: string; SalHead10: string;
  SalHead11: string; SalHead12: string; SalHead13: string; SalHead14: string; SalHead15: string;
  SalHead16: string; SalHead17: string;
  SalHeadDefault1: string; SalHeadDefault2: string; SalHeadDefault3: string; SalHeadDefault4: string; SalHeadDefault5: string;
  SalHeadDefault6: string; SalHeadDefault7: string; SalHeadDefault8: string; SalHeadDefault9: string; SalHeadDefault10: string;
  SalHeadDefault11: string; SalHeadDefault12: string; SalHeadDefault13: string; SalHeadDefault14: string; SalHeadDefault15: string;
  SalHeadDefault16: string; SalHeadDefault17: string;
}

const EMPTY: UnitForm = {
  Unitname: "", StateID: "", unitlocation: "", unittype: "", category: "", unitmanager: "",
  compcode: "", clientcode: "", branchcode: "", zonecode: "", zonegroup: "", BillingZone: "", segcode: "",
  address: "", city: "", state: "", pincode: "", telephone: "", email: "",
  contractdate: "", terminatedate: "", unitnote: "", billingname: "", billingadd: "", billadd1: "", billadd2: "",
  monthDays: "", HrsPerDay: "", OT_Setting: "", OTpayMode: "", otmonthdays: "", monthDaysG: "",
  PF_Setting: "", PF_OnEnc: "", EsiOnOT: "", wf: "", challan: "", salarylimit: "", pTax: "",
  IsBonus: "", BonusOn: "", BonusRate: "", Bonus_Limit: "", IsGratuity: "", gratuityRate: "",
  gratuityDay: "", EMP_LWF: "", EMPR_LWF: "", LeaveAllRate: "",
  sCharge: "", sTax: "", CouponRate: "", UniformRate: "", rent: "", messamt: "",
  SeperateOT: "", chknShift: "",
  SalHead1: "", SalHead2: "", SalHead3: "", SalHead4: "", SalHead5: "", SalHead6: "", SalHead7: "", SalHead8: "", SalHead9: "",
  SalHead10: "", SalHead11: "", SalHead12: "", SalHead13: "", SalHead14: "", SalHead15: "", SalHead16: "", SalHead17: "",
  SalHeadDefault1: "", SalHeadDefault2: "", SalHeadDefault3: "", SalHeadDefault4: "", SalHeadDefault5: "", SalHeadDefault6: "",
  SalHeadDefault7: "", SalHeadDefault8: "", SalHeadDefault9: "", SalHeadDefault10: "", SalHeadDefault11: "", SalHeadDefault12: "",
  SalHeadDefault13: "", SalHeadDefault14: "", SalHeadDefault15: "", SalHeadDefault16: "", SalHeadDefault17: "",
};

function toForm(raw: Record<string, unknown>): UnitForm {
  const s = (k: string) => (raw[k] == null ? "" : String(raw[k]));
  const d = (k: string) => {
    const v = raw[k];
    if (!v) return "";
    try { return new Date(v as string).toISOString().split("T")[0]; } catch { return ""; }
  };
  return {
    Unitname: s("Unitname"), StateID: s("StateID"), unitlocation: s("unitlocation"),
    unittype: s("unittype"), category: s("category"), unitmanager: s("unitmanager"),
    compcode: s("compcode"), clientcode: s("clientcode"), branchcode: s("branchcode"),
    zonecode: s("zonecode"), zonegroup: s("zonegroup"), BillingZone: s("BillingZone"),
    segcode: s("segcode"),
    address: s("address"), city: s("city"), state: s("state"), pincode: s("pincode"),
    telephone: s("telephone"), email: s("email"),
    contractdate: d("contractdate"), terminatedate: d("terminatedate"),
    unitnote: s("unitnote"), billingname: s("billingname"),
    billingadd: s("billingadd"), billadd1: s("billadd1"), billadd2: s("billadd2"),
    monthDays: s("monthDays"), HrsPerDay: s("HrsPerDay"), OT_Setting: s("OT_Setting"),
    OTpayMode: s("OTpayMode"), otmonthdays: s("otmonthdays"), monthDaysG: s("monthDaysG"),
    PF_Setting: s("PF_Setting"), PF_OnEnc: s("PF_OnEnc"), EsiOnOT: s("EsiOnOT"),
    wf: s("wf"), challan: s("challan"), salarylimit: s("salarylimit"), pTax: s("pTax"),
    IsBonus: s("IsBonus"), BonusOn: s("BonusOn"), BonusRate: s("BonusRate"),
    Bonus_Limit: s("Bonus_Limit"), IsGratuity: s("IsGratuity"), gratuityRate: s("gratuityRate"),
    gratuityDay: s("gratuityDay"), EMP_LWF: s("EMP_LWF"), EMPR_LWF: s("EMPR_LWF"),
    LeaveAllRate: s("LeaveAllRate"),
    sCharge: s("sCharge"), sTax: s("sTax"), CouponRate: s("CouponRate"),
    UniformRate: s("UniformRate"), rent: s("rent"), messamt: s("messamt"),
    SeperateOT: s("SeperateOT"), chknShift: s("chknShift"),
    SalHead1: s("SalHead1"), SalHead2: s("SalHead2"), SalHead3: s("SalHead3"), SalHead4: s("SalHead4"),
    SalHead5: s("SalHead5"), SalHead6: s("SalHead6"), SalHead7: s("SalHead7"), SalHead8: s("SalHead8"),
    SalHead9: s("SalHead9"), SalHead10: s("SalHead10"), SalHead11: s("SalHead11"), SalHead12: s("SalHead12"),
    SalHead13: s("SalHead13"), SalHead14: s("SalHead14"), SalHead15: s("SalHead15"), SalHead16: s("SalHead16"), SalHead17: s("SalHead17"),
    SalHeadDefault1: s("SalHeadDefault1"), SalHeadDefault2: s("SalHeadDefault2"), SalHeadDefault3: s("SalHeadDefault3"),
    SalHeadDefault4: s("SalHeadDefault4"), SalHeadDefault5: s("SalHeadDefault5"), SalHeadDefault6: s("SalHeadDefault6"),
    SalHeadDefault7: s("SalHeadDefault7"), SalHeadDefault8: s("SalHeadDefault8"), SalHeadDefault9: s("SalHeadDefault9"),
    SalHeadDefault10: s("SalHeadDefault10"), SalHeadDefault11: s("SalHeadDefault11"), SalHeadDefault12: s("SalHeadDefault12"),
    SalHeadDefault13: s("SalHeadDefault13"), SalHeadDefault14: s("SalHeadDefault14"), SalHeadDefault15: s("SalHeadDefault15"),
    SalHeadDefault16: s("SalHeadDefault16"), SalHeadDefault17: s("SalHeadDefault17"),
  };
}

// ── Field components ──────────────────────────────────────────────────────────
function F({
  label, id, required, error, children,
}: {
  label: string; id?: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TF({
  label, name, value, onChange, required, error, maxLength, placeholder, type = "text",
}: {
  label: string; name: string; value: string; required?: boolean; error?: string;
  maxLength?: number; placeholder?: string; type?: string;
  onChange: (name: string, val: string) => void;
}) {
  return (
    <F label={label} id={name} required={required} error={error}>
      <Input
        id={name} type={type} value={value} maxLength={maxLength}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className={`h-8 text-sm ${error ? "border-destructive" : ""}`}
      />
    </F>
  );
}

function NF({
  label, name, value, onChange, required, error, min = 0, step = "1",
}: {
  label: string; name: string; value: string; required?: boolean; error?: string;
  min?: number; step?: string;
  onChange: (name: string, val: string) => void;
}) {
  return (
    <F label={label} id={name} required={required} error={error}>
      <Input
        id={name} type="number" value={value} min={min} step={step}
        onChange={(e) => onChange(name, e.target.value)}
        className={`h-8 text-sm ${error ? "border-destructive" : ""}`}
      />
    </F>
  );
}

function SF({
  label, name, value, onChange, required, error, options, placeholder, disabled,
}: {
  label: string; name: string; value: string; required?: boolean; error?: string;
  placeholder?: string; disabled?: boolean;
  options: { value: string; label: string }[];
  onChange: (name: string, val: string) => void;
}) {
  return (
    <F label={label} id={name} required={required} error={error}>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(name, v === "__none__" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger className={`h-8 text-sm ${error ? "border-destructive" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
          <SelectValue placeholder={placeholder ?? `Select ${label.toLowerCase()}…`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{placeholder ?? `None`}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </F>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UnitFormPage({ params }: Props) {
  const unitcode  = params?.unitcode;
  const isEdit    = !!unitcode;
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const qc           = useQueryClient();

  const [form,   setForm]   = useState<UnitForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof UnitForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [tab,    setTab]    = useState("general");

  // Lookups
  const { data: companies } = useQuery({
    queryKey: ["companies-lookup"],
    queryFn: () => apiFetch<Company[]>("/api/scoped/companies"),
  });

  const { data: salaryTemplate } = useQuery({
    queryKey: ["client-salary-head-template", form.compcode],
    queryFn: () => apiFetch<Record<string, string | null>>(
      `/api/units/salary-head-template${form.compcode ? `?compcode=${encodeURIComponent(form.compcode)}` : ""}`
    ),
    enabled: !isEdit,
  });

  const { data: zonesData } = useQuery({
    queryKey: ["zones-lookup"],
    queryFn: () => apiFetch<{ data: Zone[] }>("/api/zones?pageSize=500"),
  });

  // Load existing unit for edit
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["unit", unitcode],
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/units/${unitcode}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) setForm(toForm(existing));
  }, [existing]);

  useEffect(() => {
    if (isEdit || !salaryTemplate) return;
    setForm((current) => {
      const next = { ...current };
      for (let i = 1; i <= 17; i++) {
        const nameKey = `SalHead${i}` as keyof UnitForm;
        next[nameKey] = String(salaryTemplate[`SalHead${i}`] ?? "") as never;
      }
      return next;
    });
  }, [isEdit, salaryTemplate]);

  function set(name: string, val: string) {
    if (errors[name as keyof UnitForm]) {
      setErrors((e) => { const next = { ...e }; delete next[name as keyof UnitForm]; return next; });
    }
    // Client is stored directly in UNITMASTER. Company is the only parent used in this form.
    if (name === "compcode") {
      setForm((f) => {
        const next = { ...f, compcode: val, branchcode: "", clientcode: "" };
        if (!isEdit) {
          for (let i = 1; i <= 17; i++) {
            (next as Record<string, string>)[`SalHead${i}`] = "";
            (next as Record<string, string>)[`SalHeadDefault${i}`] = "";
          }
        }
        return next;
      });
    } else {
      setForm((f) => ({ ...f, [name]: val }));
    }
  }

  // ── Frontend validation ────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Partial<Record<keyof UnitForm, string>> = {};

    if (!form.Unitname.trim())   e.Unitname  = "Client name is required";
    else if (form.Unitname.length > 100) e.Unitname = "Max 100 characters";

    if (!isEdit && !form.compcode)   e.compcode   = "Parent company is required";

    if (form.email && !EMAIL_RE.test(form.email)) e.email = "Invalid email address";
    if (form.email && form.email.length > 50)      e.email = "Max 50 characters";

    if (form.contractdate && form.terminatedate) {
      const cd = new Date(form.contractdate);
      const td = new Date(form.terminatedate);
      if (td < cd) e.terminatedate = "Terminate date must be after contract date";
    }

    const rateFields: (keyof UnitForm)[] = [
      "wf","challan","sCharge","sTax","CouponRate","BonusRate","Bonus_Limit",
      "gratuityRate","EMP_LWF","EMPR_LWF","LeaveAllRate","UniformRate","HrsPerDay",
    ];
    for (const f of rateFields) {
      if (form[f] !== "" && (isNaN(Number(form[f])) || Number(form[f]) < 0)) {
        e[f] = "Must be a non-negative number";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      // Navigate to the first tab that has an error
      const generalFields: (keyof UnitForm)[] = ["Unitname","StateID","unitlocation","unittype","category"];
      const mappingFields: (keyof UnitForm)[]  = ["compcode","zonecode"];
      const addressFields: (keyof UnitForm)[]  = ["address","city","state","pincode","telephone","email"];
      const contractFields: (keyof UnitForm)[] = ["contractdate","terminatedate"];
      const errKeys = Object.keys(errors) as (keyof UnitForm)[];
      if (errKeys.some((k) => generalFields.includes(k)))  { setTab("general");     }
      else if (errKeys.some((k) => mappingFields.includes(k))) { setTab("mapping"); }
      else if (errKeys.some((k) => addressFields.includes(k))) { setTab("address"); }
      else if (errKeys.some((k) => contractFields.includes(k))){ setTab("contract");}
      toast({ title: "Validation error", description: "Please fix the highlighted fields.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        payload[k] = v === "" ? null : v;
      }
      // Cast numeric strings to numbers for the backend
      const numFields = [
        "compcode","zonecode","BillingZone","segcode",
        "monthDays","salarylimit","PF_OnEnc","chknShift","ESIONATTREWARD",
      ];
      const floatFields = [
        "HrsPerDay","wf","challan","sCharge","sTax","CouponRate","BonusRate",
        "Bonus_Limit","gratuityRate","gratuityDay","EMP_LWF","EMPR_LWF",
        "LeaveAllRate","UniformRate","rent","messamt","otmonthdays","monthDaysG",
        ...Array.from({ length: 17 }, (_, i) => `SalHeadDefault${i + 1}`),
      ];
      for (const f of numFields) {
        if (payload[f] != null && payload[f] !== "") payload[f] = parseInt(payload[f] as string, 10);
        else payload[f] = null;
      }
      for (const f of floatFields) {
        if (payload[f] != null && payload[f] !== "") payload[f] = parseFloat(payload[f] as string);
        else payload[f] = null;
      }

      const url    = isEdit ? `/api/units/${unitcode}` : "/api/units";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: hdr(true),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        if (res.status === 409) {
          setErrors({ Unitname: err.error });
          setTab("general");
        } else if (res.status === 400 && err.error?.includes("compcode")) {
          setErrors({ compcode: err.error });
          setTab("mapping");
        } else {
          toast({ title: "Save failed", description: err.error ?? "An error occurred.", variant: "destructive" });
        }
        return;
      }

      const saved = await res.json() as Record<string, unknown>;
      toast({ title: isEdit ? "Client updated" : "Client created", description: String(saved.Unitname) });

      await qc.invalidateQueries({ queryKey: ["units"] });
      if (isEdit) await qc.invalidateQueries({ queryKey: ["unit", unitcode] });

      navigate(isEdit ? `/clients/${unitcode}` : `/clients/${saved.unitcode}`);
    } catch (err) {
      toast({ title: "Network error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading client…
      </div>
    );
  }

  // Company names are not guaranteed unique; show city + compid in the visible label while keeping compid as the selected value.
  const companyOptions = (companies ?? []).map((c) => ({ value: String(c.compid), label: c.displayLabel ?? `${c.comname} — ID ${c.compid}` }));
    const zoneOptions    = (zonesData?.data ?? []).map((z) => ({ value: String(z.zonecode), label: z.zonename }));

  const YES_NO  = [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }];
  const OT_OPTS = [
    { value: "None",      label: "None" },
    { value: "Daily",     label: "Daily" },
    { value: "Weekly",    label: "Weekly" },
    { value: "Monthly",   label: "Monthly" },
  ];
  const PF_OPTS = [
    { value: "Gross",  label: "On Gross" },
    { value: "Basic",  label: "On Basic" },
    { value: "Fixed",  label: "Fixed" },
    { value: "None",   label: "None" },
  ];
  const BONUS_ON = [
    { value: "Gross",  label: "Gross" },
    { value: "Basic",  label: "Basic" },
    { value: "Min",    label: "Minimum Wage" },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <div className="p-6 space-y-5">
        <PageHeader
          title={isEdit ? `Edit Client: ${existing?.Unitname ?? unitcode}` : "Add Client"}
          subtitle={isEdit ? `Client Code: ${unitcode}` : "Client Master · stored in UNITMASTER"}
          icon={<MapPin className="h-5 w-5 text-muted-foreground" />}
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => navigate(isEdit ? `/clients/${unitcode}` : "/clients")}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isEdit ? "Save Changes" : "Create Client"}
              </Button>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 mb-2">
            <TabsTrigger value="general"    className="text-xs h-7">General</TabsTrigger>
            <TabsTrigger value="mapping"    className="text-xs h-7">Company / Entity</TabsTrigger>
            <TabsTrigger value="address"    className="text-xs h-7">Address & Contact</TabsTrigger>
            <TabsTrigger value="contract"   className="text-xs h-7">Contract</TabsTrigger>
            <TabsTrigger value="attendance" className="text-xs h-7">Attendance</TabsTrigger>
            <TabsTrigger value="payroll"    className="text-xs h-7">Payroll</TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs h-7">Compliance</TabsTrigger>
            <TabsTrigger value="billing"    className="text-xs h-7">Billing</TabsTrigger>
            <TabsTrigger value="shifts"     className="text-xs h-7">Shifts</TabsTrigger>
          </TabsList>

          {/* ── 1. General ────────────────────────────────────────────────── */}
          <TabsContent value="general">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">General Information</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TF label="Client Name" name="Unitname" value={form.Unitname}
                      required error={errors.Unitname} maxLength={100}
                      placeholder="e.g. Amazon – Hyderabad"
                      onChange={set} />
                  <TF label="State ID (2–3 char)" name="StateID" value={form.StateID}
                      maxLength={3} placeholder="e.g. MH" onChange={set} />
                  <TF label="Client Location" name="unitlocation" value={form.unitlocation}
                      maxLength={100} onChange={set} />
                  <TF label="Client Type" name="unittype" value={form.unittype}
                      maxLength={50} placeholder="e.g. Security, Housekeeping" onChange={set} />
                  <TF label="Category" name="category" value={form.category}
                      maxLength={10} onChange={set} />
                  <TF label="Client / Site Manager" name="unitmanager" value={form.unitmanager}
                      maxLength={50} onChange={set} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 2. Company / Entity Mapping ──────────────────────────────── */}
          <TabsContent value="mapping">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Company / Entity Mapping</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SF label="Company / Entity" name="compcode" value={form.compcode}
                      required={!isEdit} error={errors.compcode}
                      options={companyOptions} placeholder="Select company / entity…"
                      onChange={set} />
                  <SF label="Zone" name="zonecode" value={form.zonecode}
                      error={errors.zonecode} options={zoneOptions}
                      placeholder="Select zone (optional)" onChange={set} />
                  <TF label="Zone Group" name="zonegroup" value={form.zonegroup}
                      maxLength={100} onChange={set} />
                  <NF label="Billing Zone" name="BillingZone" value={form.BillingZone}
                      onChange={set} />
                  <NF label="Segment Code" name="segcode" value={form.segcode}
                      onChange={set} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Client records are stored directly in <strong>UNITMASTER</strong>. Branch and separate CLIENTMASTER mapping are not used in onboarding.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 3. Address & Contact ──────────────────────────────────────── */}
          <TabsContent value="address">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Address & Contact</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <F label="Address" id="address">
                      <Textarea
                        id="address" value={form.address} maxLength={250} rows={2}
                        onChange={(e) => set("address", e.target.value)}
                        className="text-sm resize-none"
                        placeholder="Full address"
                      />
                    </F>
                  </div>
                  <TF label="City"     name="city"      value={form.city}      maxLength={100} onChange={set} />
                  <TF label="State"    name="state"     value={form.state}     maxLength={100} onChange={set} />
                  <TF label="PIN Code" name="pincode"   value={form.pincode}   maxLength={20}  onChange={set} />
                  <TF label="Telephone" name="telephone" value={form.telephone} maxLength={50}  onChange={set} />
                  <TF label="Email"    name="email"     value={form.email}     maxLength={50}
                      type="email" error={errors.email} onChange={set} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 4. Contract Details ───────────────────────────────────────── */}
          <TabsContent value="contract">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TF label="Contract Start Date" name="contractdate" value={form.contractdate}
                      type="date" error={errors.contractdate} onChange={set} />
                  <TF label="Terminate / End Date" name="terminatedate" value={form.terminatedate}
                      type="date" error={errors.terminatedate} onChange={set} />
                  <TF label="Billing Name" name="billingname" value={form.billingname}
                      maxLength={50} onChange={set} />
                  <TF label="Billing Address" name="billingadd" value={form.billingadd}
                      maxLength={100} onChange={set} />
                  <TF label="Bill Address Line 1" name="billadd1" value={form.billadd1}
                      maxLength={100} onChange={set} />
                  <TF label="Bill Address Line 2" name="billadd2" value={form.billadd2}
                      maxLength={100} onChange={set} />
                  <div className="md:col-span-2">
                    <F label="Notes" id="unitnote">
                      <Textarea
                        id="unitnote" value={form.unitnote}
                        onChange={(e) => set("unitnote", e.target.value)}
                        className="text-sm resize-none" rows={3}
                        placeholder="Internal notes about this contract…"
                      />
                    </F>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 5. Attendance ─────────────────────────────────────────────── */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Attendance Configuration</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <NF label="Month Days"    name="monthDays"   value={form.monthDays}   onChange={set} />
                  <NF label="Hrs / Day"     name="HrsPerDay"   value={form.HrsPerDay}   step="0.01" onChange={set} />
                  <NF label="OT Month Days" name="otmonthdays" value={form.otmonthdays} step="0.01" onChange={set} />
                  <NF label="G Sheet Month Days" name="monthDaysG" value={form.monthDaysG} step="0.01" onChange={set} />
                  <SF label="OT Setting"   name="OT_Setting"  value={form.OT_Setting}
                      options={OT_OPTS} onChange={set} />
                  <SF label="OT Pay Mode"  name="OTpayMode"   value={form.OTpayMode}
                      options={[
                        { value: "Hourly",  label: "Hourly" },
                        { value: "Daily",   label: "Daily" },
                        { value: "Monthly", label: "Monthly" },
                      ]} onChange={set} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  In/Out times are set via the Shift configuration module.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 6. Payroll ────────────────────────────────────────────────── */}
          <TabsContent value="payroll">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Payroll Configuration</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SF label="PF Setting"  name="PF_Setting" value={form.PF_Setting}
                      options={PF_OPTS} onChange={set} />
                  <SF label="PF On Encashment" name="PF_OnEnc" value={form.PF_OnEnc}
                      options={[{ value: "1", label: "Yes" }, { value: "0", label: "No" }]}
                      onChange={set} />
                  <SF label="ESI On OT"  name="EsiOnOT"    value={form.EsiOnOT}
                      options={YES_NO}  onChange={set} />
                  <NF label="WF Rate"    name="wf"         value={form.wf}
                      step="0.01" error={errors.wf}   onChange={set} />
                  <NF label="Challan"    name="challan"    value={form.challan}
                      step="0.01" error={errors.challan} onChange={set} />
                  <NF label="Salary Limit (₹)" name="salarylimit" value={form.salarylimit} onChange={set} />
                  <TF label="Professional Tax Code" name="pTax" value={form.pTax}
                      maxLength={50} onChange={set} />
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Salary Components &amp; Default Values</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Salary component names are loaded from Client Master and are read-only here. Enter only the default amount to prefill when a new Employee is created under this Client.
                  Employee-level values can still be edited during onboarding.
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-end mb-2 text-xs font-medium text-muted-foreground">
                  <div>#</div><div>Salary Component</div><div>Default Value (₹)</div>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 17 }, (_, idx) => idx + 1)
                    .filter((n) => String(form[`SalHead${n}` as keyof UnitForm] ?? "").trim())
                    .map((n) => {
                      const nameKey = `SalHead${n}` as keyof UnitForm;
                      const valueKey = `SalHeadDefault${n}` as keyof UnitForm;
                      return (
                        <div key={n} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center">
                          <div className="text-xs text-muted-foreground">{n}</div>
                          <div className="h-8 rounded-md border bg-muted/40 px-3 flex items-center text-sm font-medium">
                            {form[nameKey]}
                          </div>
                          <Input
                            type="number" min={0} step="0.01"
                            value={form[valueKey]}
                            placeholder="0.00"
                            onChange={(e) => set(String(valueKey), e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      );
                    })}
                  {!Array.from({ length: 17 }, (_, idx) => idx + 1).some((n) => String(form[`SalHead${n}` as keyof UnitForm] ?? "").trim()) && (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      {isEdit
                        ? "No salary components are configured in this Client Master record."
                        : "Select an Organization to load the salary components from Client Master."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 7. Compliance ─────────────────────────────────────────────── */}
          <TabsContent value="compliance">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Compliance Configuration</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SF label="Bonus Applicable" name="IsBonus"    value={form.IsBonus}    options={YES_NO} onChange={set} />
                  <SF label="Bonus Calculated On" name="BonusOn" value={form.BonusOn}    options={BONUS_ON} onChange={set} />
                  <NF label="Bonus Rate (%)" name="BonusRate"   value={form.BonusRate}   step="0.01" error={errors.BonusRate} onChange={set} />
                  <NF label="Bonus Limit (₹)" name="Bonus_Limit" value={form.Bonus_Limit} step="0.01" onChange={set} />
                  <SF label="Gratuity Applicable" name="IsGratuity" value={form.IsGratuity} options={YES_NO} onChange={set} />
                  <NF label="Gratuity Rate (%)" name="gratuityRate" value={form.gratuityRate} step="0.01" error={errors.gratuityRate} onChange={set} />
                  <NF label="Gratuity Days / Year" name="gratuityDay" value={form.gratuityDay} step="0.01" onChange={set} />
                  <NF label="Employee LWF (₹)" name="EMP_LWF"   value={form.EMP_LWF}   step="0.01" error={errors.EMP_LWF} onChange={set} />
                  <NF label="Employer LWF (₹)" name="EMPR_LWF"  value={form.EMPR_LWF}  step="0.01" error={errors.EMPR_LWF} onChange={set} />
                  <NF label="Leave Encashment Rate" name="LeaveAllRate" value={form.LeaveAllRate} step="0.01" onChange={set} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 8. Billing ────────────────────────────────────────────────── */}
          <TabsContent value="billing">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Billing Configuration</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <NF label="Service Charge (%)" name="sCharge"     value={form.sCharge}     step="0.01" error={errors.sCharge}  onChange={set} />
                  <NF label="Service Tax (%)"    name="sTax"        value={form.sTax}        step="0.01" error={errors.sTax}     onChange={set} />
                  <NF label="Coupon Rate"        name="CouponRate"  value={form.CouponRate}  step="0.01" onChange={set} />
                  <NF label="Uniform Rate (₹)"   name="UniformRate" value={form.UniformRate} step="0.01" onChange={set} />
                  <NF label="Rent (₹)"           name="rent"        value={form.rent}        step="0.01" onChange={set} />
                  <NF label="Mess Amount (₹)"    name="messamt"     value={form.messamt}     step="0.01" onChange={set} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 9. Shifts ─────────────────────────────────────────────────── */}
          <TabsContent value="shifts">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Shift & Holiday Settings</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SF label="Separate OT" name="SeperateOT" value={form.SeperateOT} options={YES_NO} onChange={set} />
                  <NF label="Shift Count" name="chknShift"  value={form.chknShift}  onChange={set} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Individual shift definitions and holiday calendars are managed in the Shifts module.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Bottom save bar */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => navigate(isEdit ? `/clients/${unitcode}` : "/clients")}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {isEdit ? "Save Changes" : "Create Client"}
          </Button>
        </div>
      </div>
    </form>
  );
}
