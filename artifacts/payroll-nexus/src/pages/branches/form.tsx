/**
 * Branch Create / Edit form
 *
 * Route: /branches/new                      → create  (POST /api/branches)
 *        /branches/:compid/:branchCode/edit → edit    (PATCH /api/branches/:branchCode)
 *
 * Writes only to BRANCH. Never touches BRANCHOFFICE, COMPANYMAST, or SaaS tables.
 */

import { useState, useEffect } from "react";
import { useLocation }         from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Save, ArrowLeft, Loader2 } from "lucide-react";
import { PageHeader }     from "@/components/ui/page-header";
import { Button }         from "@/components/ui/button";
import { Input }          from "@/components/ui/input";
import { Label }          from "@/components/ui/label";
import { Textarea }       from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const hdr = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string; }

interface BranchForm {
  BranchName:  string;
  compid:      string;
  Baddress:    string;
  BManager:    string;
  BPhone:      string;
  ESIZonecode: string;
  remark:      string;
}

const EMPTY: BranchForm = {
  BranchName:  "",
  compid:      "",
  Baddress:    "",
  BManager:    "",
  BPhone:      "",
  ESIZonecode: "",
  remark:      "",
};

// ── Field helpers ─────────────────────────────────────────────────────────────

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

export default function BranchFormPage({
  params,
}: {
  params: { compid?: string; branchCode?: string };
}) {
  const [, navigate]  = useLocation();
  const { toast }     = useToast();
  const qc            = useQueryClient();

  const isEdit    = !!params.branchCode;
  const compid    = params.compid  ?? "";
  const branchCode = params.branchCode ?? "";

  const [form, setForm]     = useState<BranchForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof BranchForm, string>>>({});
  const [saving, setSaving] = useState(false);

  // Pre-populate on edit
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["branch", compid, branchCode],
    queryFn:  () =>
      fetch(`/api/branches/${branchCode}?compid=${compid}`, { headers: hdr() })
        .then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        BranchName:  existing.BranchName   ?? "",
        compid:      String(existing.compid ?? ""),
        Baddress:    existing.Baddress      ?? "",
        BManager:    existing.BManager      ?? "",
        BPhone:      existing.BPhone        ?? "",
        ESIZonecode: existing.ESIZonecode != null ? String(existing.ESIZonecode) : "",
        remark:      existing.remark        ?? "",
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
    const e: Partial<Record<keyof BranchForm, string>> = {};

    if (!form.BranchName.trim())       e.BranchName  = "Branch name is required";
    else if (form.BranchName.length > 50) e.BranchName = "Max 50 characters";

    if (!form.compid)                   e.compid      = "Parent company is required";

    if (form.Baddress  && form.Baddress.length  > 100) e.Baddress  = "Max 100 characters";
    if (form.BManager  && form.BManager.length  > 50)  e.BManager  = "Max 50 characters";
    if (form.BPhone    && form.BPhone.length    > 50)   e.BPhone    = "Max 50 characters";
    if (form.remark    && form.remark.length    > 100)  e.remark    = "Max 100 characters";
    if (form.ESIZonecode && isNaN(Number(form.ESIZonecode)))
      e.ESIZonecode = "Must be a number";

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
        BranchName:  form.BranchName.trim(),
        compid:      Number(form.compid),
        Baddress:    form.Baddress.trim()  || null,
        BManager:    form.BManager.trim()  || null,
        BPhone:      form.BPhone.trim()    || null,
        ESIZonecode: form.ESIZonecode ? Number(form.ESIZonecode) : null,
        remark:      form.remark.trim()    || null,
      };

      let url    = "/api/branches";
      let method = "POST";

      if (isEdit) {
        url    = `/api/branches/${branchCode}`;
        method = "PATCH";
        // Include compid for scoped lookup on PATCH
        payload.compid = Number(compid);
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

      await qc.invalidateQueries({ queryKey: ["branches"] });
      await qc.invalidateQueries({ queryKey: ["branch", String(data.compid ?? form.compid), String(data.BranchCode ?? branchCode)] });

      toast({ title: isEdit ? "Branch updated" : "Branch created", description: data.BranchName });
      navigate(`/branches/${data.compid ?? form.compid}/${data.BranchCode ?? branchCode}`);
    } catch {
      toast({ title: "Error", description: "Unexpected error. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof BranchForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading branch…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title={isEdit ? "Edit Branch" : "New Branch"}
        subtitle={isEdit ? `BranchCode ${branchCode} · compid ${compid}` : "Add a new operational branch"}
        icon={<GitBranch className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() =>
                isEdit
                  ? navigate(`/branches/${compid}/${branchCode}`)
                  : navigate("/branches")
              }
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? "Save Changes" : "Create Branch"}
            </Button>
          </div>
        }
      />

      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Branch Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <F label="Branch Name *" id="BranchName" error={errors.BranchName}>
            <Input
              id="BranchName" value={form.BranchName} maxLength={50}
              placeholder="e.g. Mumbai North"
              onChange={(e) => set("BranchName", e.target.value)}
            />
          </F>

          <F label="Parent Company *" id="compid" error={errors.compid}>
            <Select
              value={form.compid}
              onValueChange={(v) => set("compid", v)}
              disabled={isEdit}
            >
              <SelectTrigger id="compid">
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

          <F label="ESI Zone Code" id="ESIZonecode" error={errors.ESIZonecode}>
            <Input
              id="ESIZonecode" value={form.ESIZonecode}
              placeholder="Zone number (optional)"
              onChange={(e) => set("ESIZonecode", e.target.value)}
            />
          </F>
        </CardContent>
      </Card>

      {/* Contact & Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contact &amp; Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <F label="Address" id="Baddress" error={errors.Baddress}>
            <Textarea
              id="Baddress" value={form.Baddress} maxLength={100} rows={2}
              placeholder="Branch address"
              onChange={(e) => set("Baddress", e.target.value)}
            />
          </F>

          <F label="Manager" id="BManager" error={errors.BManager}>
            <Input
              id="BManager" value={form.BManager} maxLength={50}
              placeholder="Manager name"
              onChange={(e) => set("BManager", e.target.value)}
            />
          </F>

          <F label="Phone" id="BPhone" error={errors.BPhone}>
            <Input
              id="BPhone" value={form.BPhone} maxLength={50}
              placeholder="Phone number"
              onChange={(e) => set("BPhone", e.target.value)}
            />
          </F>

          <F label="Remark" id="remark" error={errors.remark}>
            <Input
              id="remark" value={form.remark} maxLength={100}
              placeholder="Optional remark"
              onChange={(e) => set("remark", e.target.value)}
            />
          </F>
        </CardContent>
      </Card>
    </form>
  );
}
