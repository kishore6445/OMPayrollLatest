/**
 * Company Create / Edit form
 *
 * Route: /company/new              → create
 *        /company/:compid/edit     → edit
 *
 * Sections (tabs):
 *   1. Identity      — name, nature of work, registration & corporate identifiers
 *   2. Address       — address, contact details, local office
 *   3. Statutory     — PAN, TAN, GSTIN, state tax, labour licence, establishment
 *   4. PF / ESI      — provident fund and ESI registration numbers
 *   5. Banking       — bank name, account, IFSC
 *   6. Billing       — prefixes, rates (optional/advanced)
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save, ArrowLeft, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyForm {
  // Identity
  comname: string;
  NatureOfWork: string;
  regno: string;
  CINNo: string;
  corpID: string;
  // Address
  address: string;
  regadd: string;
  city: string;
  district: string;
  state: string;
  CompStateCode: string;
  pinCode: string;
  country: string;
  phone: string;
  fax: string;
  mobno: string;
  email: string;
  web: string;
  Local_Office: string;
  policestation: string;
  pstation: string;
  // Statutory
  PAN_no: string;
  TAN_no: string;
  TIN_NO: string;
  GSTINNo: string;
  COMPGSTIN: string;
  StaxNo: string;
  VATNo: string;
  STNo: string;
  LinNo: string;
  EstablishmentCode: string;
  // PF / ESI
  pfno: string;
  pfcode: string;
  PFSUbCode: string;
  esino: string;
  esicode: string;
  ESISubCode: string;
  // Banking
  BankName: string;
  acno: string;
  BankIFSCCode: string;
  bankcode: string;
  // Billing
  billprefix: string;
  NewBillPrefix: string;
  offerletterprefix: string;
  VoucherPreFix: string;
  KSplRate: string;
  KCrptRate: string;
  MonthlyDollarRate: string;
}

const EMPTY: CompanyForm = {
  comname: "", NatureOfWork: "", regno: "", CINNo: "", corpID: "",
  address: "", regadd: "", city: "", district: "", state: "", CompStateCode: "",
  pinCode: "", country: "India", phone: "", fax: "", mobno: "", email: "", web: "",
  Local_Office: "", policestation: "", pstation: "",
  PAN_no: "", TAN_no: "", TIN_NO: "", GSTINNo: "", COMPGSTIN: "",
  StaxNo: "", VATNo: "", STNo: "", LinNo: "", EstablishmentCode: "",
  pfno: "", pfcode: "", PFSUbCode: "", esino: "", esicode: "", ESISubCode: "",
  BankName: "", acno: "", BankIFSCCode: "", bankcode: "",
  billprefix: "", NewBillPrefix: "", offerletterprefix: "", VoucherPreFix: "",
  KSplRate: "", KCrptRate: "", MonthlyDollarRate: "",
};

// ── Field component ───────────────────────────────────────────────────────────

function F({
  label, name, value, onChange, required, placeholder,
}: {
  label: string;
  name: keyof CompanyForm;
  value: string;
  onChange: (name: keyof CompanyForm, val: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder ?? ""}
        className="h-8 text-sm"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  params?: { compid?: string };
}

export default function CompanyFormPage({ params }: Props) {
  const compid = params?.compid ? parseInt(params.compid, 10) : null;
  const isEdit = compid !== null && !isNaN(compid);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});

  // Load existing data for edit
  const { data: existing, isLoading: loadingExisting } = useQuery<Record<string, unknown>>({
    queryKey: ["company", String(compid)],
    queryFn: () =>
      fetch(`/api/company/${compid}`, { headers: hdr() }).then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(EMPTY) as (keyof CompanyForm)[]) {
        const raw = existing[key];
        next[key] = raw !== null && raw !== undefined ? String(raw) : "";
      }
      return next;
    });
  }, [existing]);

  const set = (name: keyof CompanyForm, val: string) => {
    setForm((prev) => ({ ...prev, [name]: val }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CompanyForm, string>> = {};
    if (!form.comname.trim()) errs.comname = "Company name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Strip empty strings → omit from payload so DB gets nulls via server-side coercion
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== "") payload[k] = v;
      }

      const url = isEdit ? `/api/company/${compid}` : "/api/company";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: hdr(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const saved = await res.json();
      const savedId = saved.compid ?? compid;

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company", String(savedId)] });

      toast({
        title: isEdit ? "Company updated" : "Company created",
        description: saved.comname,
      });

      navigate(`/company/${savedId}`);
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (isEdit && existing && (existing as any).error) {
    return <div className="p-6 text-sm text-destructive">Company not found.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <PageHeader
        title={isEdit ? `Edit — ${existing?.comname ?? `Company ${compid}`}` : "New Company"}
        subtitle="COMPANYMAST"
        icon={<Building2 className="h-5 w-5" />}
        back={isEdit ? `/company/${compid}` : "/company"}
        actions={
          <Button onClick={handleSubmit} disabled={saving} size="sm">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />{isEdit ? "Save Changes" : "Create Company"}</>
            }
          </Button>
        }
      />

      <Tabs defaultValue="identity">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-1">
          <TabsTrigger value="identity"   className="text-xs">Identity</TabsTrigger>
          <TabsTrigger value="address"    className="text-xs">Address &amp; Contact</TabsTrigger>
          <TabsTrigger value="statutory"  className="text-xs">Statutory</TabsTrigger>
          <TabsTrigger value="pfesi"      className="text-xs">PF / ESI</TabsTrigger>
          <TabsTrigger value="banking"    className="text-xs">Banking</TabsTrigger>
          <TabsTrigger value="billing"    className="text-xs">Billing</TabsTrigger>
        </TabsList>

        {/* ── Identity ───────────────────────────────────────────────────────── */}
        <TabsContent value="identity">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Identity &amp; Registration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <F label="Company Name" name="comname" value={form.comname} onChange={set} required />
                {errors.comname && (
                  <p className="text-xs text-destructive mt-1">{errors.comname}</p>
                )}
              </div>
              <F label="Nature of Work"    name="NatureOfWork" value={form.NatureOfWork} onChange={set} />
              <F label="Registration No"   name="regno"        value={form.regno}        onChange={set} />
              <F label="CIN No"            name="CINNo"        value={form.CINNo}        onChange={set} placeholder="L12345AB2000PLC123456" />
              <F label="Organization Code / Location Code" name="corpID"       value={form.corpID}       onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Address & Contact ──────────────────────────────────────────────── */}
        <TabsContent value="address">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Address &amp; Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <F label="Registered Office Address" name="address" value={form.address} onChange={set} />
              </div>
              <div className="sm:col-span-2">
                <F label="Registered Address (statutory)" name="regadd" value={form.regadd} onChange={set} />
              </div>
              <F label="City"         name="city"     value={form.city}     onChange={set} />
              <F label="District"     name="district" value={form.district} onChange={set} />
              <F label="State"        name="state"    value={form.state}    onChange={set} placeholder="Maharashtra" />
              <F label="State Code"   name="CompStateCode" value={form.CompStateCode} onChange={set} placeholder="27" />
              <F label="PIN Code"     name="pinCode"  value={form.pinCode}  onChange={set} placeholder="400001" />
              <F label="Country"      name="country"  value={form.country}  onChange={set} />
              <F label="Phone"        name="phone"    value={form.phone}    onChange={set} />
              <F label="Fax"          name="fax"      value={form.fax}      onChange={set} />
              <F label="Mobile"       name="mobno"    value={form.mobno}    onChange={set} />
              <F label="Email"        name="email"    value={form.email}    onChange={set} placeholder="accounts@company.com" />
              <F label="Website"      name="web"      value={form.web}      onChange={set} placeholder="https://www.company.com" />
              <F label="Local Office" name="Local_Office"  value={form.Local_Office}  onChange={set} />
              <F label="Police Station" name="policestation" value={form.policestation} onChange={set} />
              <F label="P Station"    name="pstation" value={form.pstation} onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Statutory ─────────────────────────────────────────────────────── */}
        <TabsContent value="statutory">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Statutory Identifiers</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="PAN No"              name="PAN_no"          value={form.PAN_no}          onChange={set} placeholder="AABCC1234D" />
              <F label="TAN No"              name="TAN_no"          value={form.TAN_no}          onChange={set} placeholder="MUMA12345B" />
              <F label="TIN No"              name="TIN_NO"          value={form.TIN_NO}          onChange={set} />
              <F label="GSTIN No"            name="GSTINNo"         value={form.GSTINNo}         onChange={set} placeholder="27AABCC1234D1ZK" />
              <F label="COMP GSTIN"          name="COMPGSTIN"       value={form.COMPGSTIN}       onChange={set} />
              <F label="Service Tax No"      name="StaxNo"          value={form.StaxNo}          onChange={set} />
              <F label="VAT No"              name="VATNo"           value={form.VATNo}           onChange={set} />
              <F label="ST No"               name="STNo"            value={form.STNo}            onChange={set} />
              <F label="Labour Licence No"   name="LinNo"           value={form.LinNo}           onChange={set} />
              <F label="Establishment Code"  name="EstablishmentCode" value={form.EstablishmentCode} onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PF / ESI ──────────────────────────────────────────────────────── */}
        <TabsContent value="pfesi">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Provident Fund &amp; ESI Registration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="PF No"          name="pfno"       value={form.pfno}       onChange={set} placeholder="MH/MUM/12345" />
              <F label="PF Code"        name="pfcode"     value={form.pfcode}     onChange={set} />
              <F label="PF Sub-Code"    name="PFSUbCode"  value={form.PFSUbCode}  onChange={set} />
              <F label="ESI No"         name="esino"      value={form.esino}      onChange={set} placeholder="31-12345-101" />
              <F label="ESI Code"       name="esicode"    value={form.esicode}    onChange={set} />
              <F label="ESI Sub-Code"   name="ESISubCode" value={form.ESISubCode} onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Banking ───────────────────────────────────────────────────────── */}
        <TabsContent value="banking">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Banking Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <F label="Bank Name" name="BankName" value={form.BankName} onChange={set} placeholder="State Bank of India" />
              </div>
              <F label="Account No" name="acno"        value={form.acno}        onChange={set} />
              <F label="IFSC Code"  name="BankIFSCCode" value={form.BankIFSCCode} onChange={set} placeholder="SBIN0001234" />
              <F label="Bank Code"  name="bankcode"    value={form.bankcode}    onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Billing ───────────────────────────────────────────────────────── */}
        <TabsContent value="billing">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Billing Prefixes &amp; Rates</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Bill Prefix"          name="billprefix"       value={form.billprefix}       onChange={set} placeholder="INV" />
              <F label="New Bill Prefix"      name="NewBillPrefix"    value={form.NewBillPrefix}    onChange={set} />
              <F label="Offer Letter Prefix"  name="offerletterprefix" value={form.offerletterprefix} onChange={set} placeholder="OL" />
              <F label="Voucher Prefix"       name="VoucherPreFix"    value={form.VoucherPreFix}    onChange={set} placeholder="V" />
              <F label="KSpl Rate"            name="KSplRate"         value={form.KSplRate}         onChange={set} />
              <F label="KCrpt Rate"           name="KCrptRate"        value={form.KCrptRate}        onChange={set} />
              <F label="Monthly Dollar Rate"  name="MonthlyDollarRate" value={form.MonthlyDollarRate} onChange={set} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bottom save bar */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(isEdit ? `/company/${compid}` : "/company")}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving} size="sm">
          {saving
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
            : <><Save className="h-3.5 w-3.5 mr-1.5" />{isEdit ? "Save Changes" : "Create Company"}</>
          }
        </Button>
      </div>
    </div>
  );
}
