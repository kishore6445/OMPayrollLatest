/**
 * Client Create / Edit form
 *
 * Route: /clients/new              → create (POST /api/clients)
 *        /clients/:clientcode/edit → edit   (PATCH /api/clients/:clientcode)
 *
 * Writes to CLIENTMASTER + BRANCHCLIENT (for branch assignments).
 * Never touches any SaaS table.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Save, ArrowLeft, Loader2, GitBranch } from "lucide-react";
import { PageHeader }   from "@/components/ui/page-header";
import { Button }       from "@/components/ui/button";
import { Input }        from "@/components/ui/input";
import { Label }        from "@/components/ui/label";
import { Textarea }     from "@/components/ui/textarea";
import { Checkbox }     from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const hdr = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

// ── Indian PAN format ─────────────────────────────────────────────────────────
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
function validatePan(pan: string): string | null {
  if (!pan) return null;
  if (!PAN_RE.test(pan.toUpperCase())) return "PAN must be in format AAAAA9999A (e.g. ABCDE1234F)";
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company  { compid: number; comname: string; city?: string | null; state?: string | null; displayLabel?: string }
interface Branch   { BranchCode: number; BranchName: string; compid: number }
interface BranchAssignment { branchcode: number; BranchName?: string; is_active: boolean }

interface ClientForm {
  Clientname: string;
  VatNo:      string;
  PANNo:      string;
  des:        string;
  compid:     string;
}

const EMPTY: ClientForm = { Clientname: "", VatNo: "", PANNo: "", des: "", compid: "" };

// ── Main component ────────────────────────────────────────────────────────────

interface Props { params?: { clientcode?: string } }

export default function ClientFormPage({ params }: Props) {
  const clientcode = params?.clientcode ? parseInt(params.clientcode, 10) : null;
  const isEdit     = clientcode !== null && !isNaN(clientcode);
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const queryClient  = useQueryClient();

  const [form,           setForm]           = useState<ClientForm>(EMPTY);
  const [selectedBranches, setSelectedBranches] = useState<number[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [errors,         setErrors]         = useState<Partial<Record<keyof ClientForm | "_form", string>>>({});

  // ── Companies ────────────────────────────────────────────────────────────────
  const { data: companies = [], isLoading: loadingCompanies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => fetch("/api/scoped/companies", { headers: hdr() }).then((r) => r.json()),
  });

  // ── Branches for selected company ─────────────────────────────────────────────
  const { data: branches = [], isLoading: loadingBranches } = useQuery<Branch[]>({
    queryKey: ["branches", form.compid],
    queryFn: () =>
      fetch(`/api/masters/branches?compid=${encodeURIComponent(form.compid)}`, { headers: hdr() })
        .then((r) => r.json()),
    enabled: !!form.compid,
    staleTime: 120_000,
  });

  // ── Load existing client for edit ─────────────────────────────────────────────
  const { data: existing, isLoading: loadingExisting } = useQuery<Record<string, unknown>>({
    queryKey: ["client", clientcode],
    queryFn: () =>
      fetch(`/api/clients/${clientcode}`, { headers: hdr() }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    enabled: isEdit,
  });

  // Hydrate form from existing
  useEffect(() => {
    if (!existing) return;
    setForm({
      Clientname: String(existing.Clientname ?? ""),
      VatNo:      String(existing.VatNo      ?? ""),
      PANNo:      String(existing.PANNo      ?? ""),
      des:        String(existing.des        ?? ""),
      compid:     existing.compid != null ? String(existing.compid) : "",
    });
    // Hydrate branch assignments from the embedded branches array
    const assignedBranches = existing.branches as BranchAssignment[] | undefined;
    if (assignedBranches && Array.isArray(assignedBranches)) {
      setSelectedBranches(
        assignedBranches.filter((b) => b.is_active).map((b) => b.branchcode)
      );
    }
  }, [existing]);

  // Clear branch selection when company changes
  const set = (name: keyof ClientForm, val: string) => {
    setForm((prev) => {
      if (name === "compid" && val !== prev.compid) {
        setSelectedBranches([]);
      }
      return { ...prev, [name]: val };
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const toggleBranch = (branchCode: number, checked: boolean) => {
    setSelectedBranches((prev) =>
      checked ? [...prev, branchCode] : prev.filter((c) => c !== branchCode)
    );
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.Clientname.trim())        errs.Clientname = "Client name is required";
    if (!form.compid)                   errs.compid     = "Parent company is required";
    const panErr = validatePan(form.PANNo.trim());
    if (panErr)                         errs.PANNo      = panErr;
    if (form.VatNo.trim().length > 50)  errs.VatNo      = "VAT No must be 50 characters or fewer";
    if (form.des.trim().length   > 500) errs.des        = "Description must be 500 characters or fewer";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    const payload: Record<string, unknown> = {};
    if (form.Clientname.trim()) payload.Clientname  = form.Clientname.trim();
    if (form.compid)            payload.compid      = parseInt(form.compid, 10);
    if (form.PANNo.trim())      payload.PANNo       = form.PANNo.trim().toUpperCase();
    if (form.VatNo.trim())      payload.VatNo       = form.VatNo.trim();
    if (form.des.trim())        payload.des         = form.des.trim();
    payload.branchcodes = selectedBranches;   // always send (empty = clear all)

    const url    = isEdit ? `/api/clients/${clientcode}` : "/api/clients";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: hdr(true),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(body.error ?? `HTTP ${res.status}`));
      }

      const saved = await res.json() as Record<string, unknown>;
      const savedId = (saved.clientcode as number | undefined) ?? clientcode;

      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", savedId] });

      toast({
        title:       isEdit ? "Client updated" : "Client created",
        description: String(saved.Clientname ?? ""),
      });

      navigate(`/clients/${savedId}`);
    } catch (err: unknown) {
      toast({
        title:       "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant:     "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const saveLabel = isEdit ? "Save Changes" : "Create Client";

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title={isEdit ? `Edit — ${String(existing?.Clientname ?? `Client ${clientcode}`)}` : "New Client"}
        subtitle="CLIENTMASTER"
        icon={<Briefcase className="h-5 w-5" />}
        back={isEdit ? `/clients/${clientcode}` : "/clients"}
        actions={
          <Button onClick={handleSubmit} disabled={saving} size="sm">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />{saveLabel}</>
            }
          </Button>
        }
      />

      {/* ── Identity card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client Name */}
          <div className="space-y-1">
            <Label htmlFor="Clientname" className="text-xs">
              Client Name<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="Clientname"
              value={form.Clientname}
              maxLength={200}
              onChange={(e) => set("Clientname", e.target.value)}
              placeholder="Enter client name"
              className="h-8 text-sm"
            />
            {errors.Clientname && <p className="text-xs text-destructive">{errors.Clientname}</p>}
          </div>

          {/* Parent Company */}
          <div className="space-y-1">
            <Label htmlFor="compid" className="text-xs">
              Parent Company (COMPANYMAST)<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Select
              value={form.compid}
              onValueChange={(v) => set("compid", v)}
              disabled={loadingCompanies}
            >
              <SelectTrigger className="h-8 text-sm" id="compid">
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
            {errors.compid && <p className="text-xs text-destructive">{errors.compid}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="des" className="text-xs">Description</Label>
            <Textarea
              id="des"
              value={form.des}
              maxLength={500}
              onChange={(e) => set("des", e.target.value)}
              placeholder="Optional description"
              className="text-sm resize-none"
              rows={3}
            />
            {errors.des && <p className="text-xs text-destructive">{errors.des}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Branch Assignment ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Assigned Branches</CardTitle>
          </div>
          <p className="text-[11px] text-muted-foreground pl-6">
            Select which branches handle this client. Workers can then be assigned through these branches.
          </p>
        </CardHeader>
        <CardContent>
          {!form.compid ? (
            <p className="text-xs text-muted-foreground italic">Select a company first to see its branches.</p>
          ) : loadingBranches ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Loading branches…
            </div>
          ) : branches.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No branches found for this company.</p>
          ) : (
            <div className="space-y-2">
              {branches.map((b) => (
                <label key={b.BranchCode} className="flex items-center gap-2.5 cursor-pointer group">
                  <Checkbox
                    id={`branch-${b.BranchCode}`}
                    checked={selectedBranches.includes(b.BranchCode)}
                    onCheckedChange={(checked) => toggleBranch(b.BranchCode, Boolean(checked))}
                  />
                  <span className="text-sm group-hover:text-foreground transition-colors">
                    {b.BranchName}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">#{b.BranchCode}</span>
                </label>
              ))}
              {selectedBranches.length > 0 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  {selectedBranches.length} branch{selectedBranches.length > 1 ? "es" : ""} selected
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Statutory Identifiers ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Statutory Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="PANNo" className="text-xs">PAN No</Label>
            <Input
              id="PANNo"
              value={form.PANNo}
              maxLength={25}
              onChange={(e) => set("PANNo", e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              className="h-8 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground">Format: AAAAA9999A</p>
            {errors.PANNo && <p className="text-xs text-destructive">{errors.PANNo}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="VatNo" className="text-xs">VAT No</Label>
            <Input
              id="VatNo"
              value={form.VatNo}
              maxLength={50}
              onChange={(e) => set("VatNo", e.target.value)}
              placeholder="State VAT / TIN number"
              className="h-8 text-sm font-mono"
            />
            {errors.VatNo && <p className="text-xs text-destructive">{errors.VatNo}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Bottom bar ── */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(isEdit ? `/clients/${clientcode}` : "/clients")}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving} size="sm">
          {saving
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
            : <><Save className="h-3.5 w-3.5 mr-1.5" />{saveLabel}</>
          }
        </Button>
      </div>
    </div>
  );
}
