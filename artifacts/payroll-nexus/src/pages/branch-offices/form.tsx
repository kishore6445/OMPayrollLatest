/**
 * Branch Office Create / Edit form
 *
 * Route: /branch-offices/new                → create  (POST /api/branch-offices)
 *        /branch-offices/:compid/:id/edit   → edit    (PATCH /api/branch-offices/:id)
 *
 * Writes only to BRANCHOFFICE. Never touches BRANCH, COMPANYMAST, or SaaS tables.
 */

import { useState, useEffect } from "react";
import { useLocation }         from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save, ArrowLeft, Loader2 } from "lucide-react";
import { PageHeader }   from "@/components/ui/page-header";
import { Button }       from "@/components/ui/button";
import { Input }        from "@/components/ui/input";
import { Label }        from "@/components/ui/label";
import { Textarea }     from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const hdr = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

// ── GSTIN regex (15-char Indian format) ───────────────────────────────────────
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE   = /^[1-9][0-9]{5}$/;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }

interface BranchOfficeForm {
  Compid:          string;
  BranchAddress:   string;
  BranchCity:      string;
  BranchPincode:   string;
  BranchState:     string;
  BGSTIN:          string;
  BranchPhone:     string;
  BranchEmail:     string;
  BranchWebSite:   string;
  BranchStatecode: string;
}

const EMPTY: BranchOfficeForm = {
  Compid:          "",
  BranchAddress:   "",
  BranchCity:      "",
  BranchPincode:   "",
  BranchState:     "",
  BGSTIN:          "",
  BranchPhone:     "",
  BranchEmail:     "",
  BranchWebSite:   "",
  BranchStatecode: "",
};

function F({
  label, id, children, error,
}: {
  label: string; id: string; children: React.ReactNode; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BranchOfficeFormPage({
  params,
}: {
  params: { compid?: string; id?: string };
}) {
  const [, navigate]  = useLocation();
  const { toast }     = useToast();
  const qc            = useQueryClient();

  const isEdit = !!params.id;
  const compid = params.compid ?? "";
  const id     = params.id    ?? "";

  const [form, setForm]     = useState<BranchOfficeForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof BranchOfficeForm, string>>>({});
  const [saving, setSaving] = useState(false);

  // Pre-populate on edit
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["branch-office", compid, id],
    queryFn:  () =>
      fetch(`/api/branch-offices/${id}?compid=${compid}`, { headers: hdr() })
        .then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        Compid:          String(existing.Compid ?? ""),
        BranchAddress:   existing.BranchAddress   ?? "",
        BranchCity:      existing.BranchCity       ?? "",
        BranchPincode:   existing.BranchPincode != null ? String(existing.BranchPincode) : "",
        BranchState:     existing.BranchState      ?? "",
        BGSTIN:          existing.BGSTIN            ?? "",
        BranchPhone:     existing.BranchPhone       ?? "",
        BranchEmail:     existing.BranchEmail       ?? "",
        BranchWebSite:   existing.BranchWebSite     ?? "",
        BranchStatecode: existing.BranchStatecode   ?? "",
      });
    }
  }, [existing, isEdit]);

  // Company list
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn:  () =>
      fetch("/api/company?pageSize=200", { headers: hdr() })
        .then((r) => r.json())
        .then((d) => d.data ?? d),
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Partial<Record<keyof BranchOfficeForm, string>> = {};

    if (!form.Compid) e.Compid = "Parent company is required";

    if (form.BranchAddress  && form.BranchAddress.length  > 500) e.BranchAddress  = "Max 500 characters";
    if (form.BranchCity     && form.BranchCity.length     > 50)   e.BranchCity     = "Max 50 characters";
    if (form.BranchState    && form.BranchState.length    > 50)   e.BranchState    = "Max 50 characters";
    if (form.BranchStatecode && form.BranchStatecode.length > 20) e.BranchStatecode = "Max 20 characters";
    if (form.BranchPhone    && form.BranchPhone.length    > 50)   e.BranchPhone    = "Max 50 characters";
    if (form.BranchWebSite  && form.BranchWebSite.length  > 50)   e.BranchWebSite  = "Max 50 characters";

    if (form.BranchPincode && !PIN_RE.test(form.BranchPincode))
      e.BranchPincode = "Must be a valid 6-digit PIN code";

    if (form.BGSTIN && !GSTIN_RE.test(form.BGSTIN.toUpperCase()))
      e.BGSTIN = "Must be a valid 15-character GSTIN (e.g. 27AABCT1234A1Z5)";

    if (form.BranchEmail) {
      if (!EMAIL_RE.test(form.BranchEmail)) e.BranchEmail = "Must be a valid email address";
      else if (form.BranchEmail.length > 50) e.BranchEmail = "Max 50 characters";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        Compid:          Number(form.Compid),
        BranchAddress:   form.BranchAddress.trim()   || null,
        BranchCity:      form.BranchCity.trim()       || null,
        BranchPincode:   form.BranchPincode ? Number(form.BranchPincode) : null,
        BranchState:     form.BranchState.trim()      || null,
        BGSTIN:          form.BGSTIN.trim().toUpperCase() || null,
        BranchPhone:     form.BranchPhone.trim()      || null,
        BranchEmail:     form.BranchEmail.trim().toLowerCase() || null,
        BranchWebSite:   form.BranchWebSite.trim()   || null,
        BranchStatecode: form.BranchStatecode.trim() || null,
      };

      let url    = "/api/branch-offices";
      let method = "POST";

      if (isEdit) {
        url    = `/api/branch-offices/${id}`;
        method = "PATCH";
      }

      const res = await fetch(url, {
        method,
        headers: hdr(true),
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Save failed", variant: "destructive" });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["branch-offices"] });
      await qc.invalidateQueries({
        queryKey: ["branch-office", String(data.Compid ?? form.Compid), String(data.BranchStateID ?? id)],
      });

      const label = data.BranchState ? `${data.BranchState} Office` : `Office #${data.BranchStateID}`;
      toast({ title: isEdit ? "Office updated" : "Office created", description: label });
      navigate(`/branch-offices/${data.Compid ?? form.Compid}/${data.BranchStateID ?? id}`);
    } catch {
      toast({ title: "Error", description: "Unexpected error. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof BranchOfficeForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading branch office…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title={isEdit ? "Edit Branch Office" : "New Branch Office"}
        subtitle={isEdit ? `StateID ${id} · Compid ${compid}` : "Register a company's state-level branch office"}
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() =>
                isEdit
                  ? navigate(`/branch-offices/${compid}/${id}`)
                  : navigate("/branches")
              }
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? "Save Changes" : "Create Office"}
            </Button>
          </div>
        }
      />

      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <F label="Parent Company *" id="Compid" error={errors.Compid}>
            <Select
              value={form.Compid}
              onValueChange={(v) => set("Compid", v)}
              disabled={isEdit}
            >
              <SelectTrigger id="Compid">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.compid} value={String(c.compid)}>
                    {c.displayLabel ?? `${c.comname} — ID ${c.compid}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-muted-foreground">Company cannot be changed after creation.</p>
            )}
          </F>

          <F label="State" id="BranchState" error={errors.BranchState}>
            <Input
              id="BranchState" value={form.BranchState} maxLength={50}
              placeholder="e.g. Maharashtra"
              onChange={(e) => set("BranchState", e.target.value)}
            />
          </F>

          <F label="State Code" id="BranchStatecode" error={errors.BranchStatecode}>
            <Input
              id="BranchStatecode" value={form.BranchStatecode} maxLength={20}
              placeholder="e.g. MH"
              onChange={(e) => set("BranchStatecode", e.target.value)}
            />
          </F>

          <F label="GSTIN" id="BGSTIN" error={errors.BGSTIN}>
            <Input
              id="BGSTIN" value={form.BGSTIN} maxLength={15}
              placeholder="27AABCT1234A1Z5"
              onChange={(e) => set("BGSTIN", e.target.value.toUpperCase())}
            />
            <p className="text-xs text-muted-foreground">Format: 27AABCT1234A1Z5</p>
          </F>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <F label="Address" id="BranchAddress" error={errors.BranchAddress}>
              <Textarea
                id="BranchAddress" value={form.BranchAddress} maxLength={500} rows={3}
                placeholder="Full office address"
                onChange={(e) => set("BranchAddress", e.target.value)}
              />
            </F>
          </div>

          <F label="City" id="BranchCity" error={errors.BranchCity}>
            <Input
              id="BranchCity" value={form.BranchCity} maxLength={50}
              placeholder="City"
              onChange={(e) => set("BranchCity", e.target.value)}
            />
          </F>

          <F label="PIN Code" id="BranchPincode" error={errors.BranchPincode}>
            <Input
              id="BranchPincode" value={form.BranchPincode}
              placeholder="6-digit PIN code"
              maxLength={6}
              onChange={(e) => set("BranchPincode", e.target.value.replace(/\D/g, ""))}
            />
          </F>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <F label="Phone" id="BranchPhone" error={errors.BranchPhone}>
            <Input
              id="BranchPhone" value={form.BranchPhone} maxLength={50}
              placeholder="Phone number"
              onChange={(e) => set("BranchPhone", e.target.value)}
            />
          </F>

          <F label="Email" id="BranchEmail" error={errors.BranchEmail}>
            <Input
              id="BranchEmail" value={form.BranchEmail} maxLength={50}
              type="email" placeholder="office@company.com"
              onChange={(e) => set("BranchEmail", e.target.value)}
            />
          </F>

          <F label="Website" id="BranchWebSite" error={errors.BranchWebSite}>
            <Input
              id="BranchWebSite" value={form.BranchWebSite} maxLength={50}
              placeholder="https://…"
              onChange={(e) => set("BranchWebSite", e.target.value)}
            />
          </F>
        </CardContent>
      </Card>
    </form>
  );
}
