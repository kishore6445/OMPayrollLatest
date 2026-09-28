import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Save, Loader2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`, "Content-Type": "application/json" });
function Row({ label, required, children }: { label: string; required?: boolean; children: any }) { return <div className="grid grid-cols-3 gap-4 py-3 border-b last:border-0"><label className="text-sm text-muted-foreground text-right pt-2">{label}{required && <span className="text-destructive"> *</span>}</label><div className="col-span-2">{children}</div></div>; }

export default function DesignationFormPage({ params }: { params: { code?: string } }) {
  const edit = !!params.code;
  const code = params.code ? decodeURIComponent(params.code) : undefined;
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(edit);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ DESICODE: "", DESINAME: "", DispDesig: "", DUTYHRS: "", DESC: "" });

  useEffect(() => {
    if (!edit) return;
    fetch(`/api/designations/${code}`, { headers: hdr() }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load designation");
      setForm({ DESICODE: String(d.DESICODE ?? ""), DESINAME: d.DESINAME ?? "", DispDesig: d.DispDesig ?? "", DUTYHRS: d.DUTYHRS == null ? "" : String(d.DUTYHRS), DESC: d.DESC ?? "" });
      setLoading(false);
    }).catch((e) => { setError(e instanceof Error ? e.message : "Could not load designation"); setLoading(false); });
  }, [edit, code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSaving(true);
    const payload: Record<string, unknown> = { DESINAME: form.DESINAME.trim(), DispDesig: form.DispDesig.trim(), DUTYHRS: form.DUTYHRS, DESC: form.DESC.trim() };
    if (!edit) payload.DESICODE = form.DESICODE.trim();
    try {
      const r = await fetch(edit ? `/api/designations/${code}` : "/api/designations", { method: edit ? "PATCH" : "POST", headers: hdr(), body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Could not save designation"); return; }
      toast({ title: edit ? "Designation updated" : "Designation created" });
      nav("/designations");
    } catch { setError("Network error — please try again"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading designation…</div>;
  return <div className="p-6 space-y-6 max-w-2xl">
    <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon"><Link href="/designations"><ArrowLeft className="h-4 w-4" /></Link></Button><PageHeader title={edit ? `Edit Designation — ${code}` : "Add Designation"} subtitle="DESIGNATIONMASTER" icon={<BadgeCheck className="h-5 w-5" />} /></div>
    {error && <div className="border border-destructive/50 bg-destructive/5 text-destructive rounded-md px-4 py-3 text-sm">{error}</div>}
    <form onSubmit={submit}><Card><CardHeader><CardTitle className="text-sm">Designation Details</CardTitle></CardHeader><CardContent>
      <Row label="Designation Code" required><Input value={form.DESICODE} disabled={edit} inputMode="numeric" onChange={(e) => setForm({ ...form, DESICODE: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 101" /></Row>
      <Row label="Designation Name" required><Input maxLength={50} value={form.DESINAME} onChange={(e) => setForm({ ...form, DESINAME: e.target.value })} placeholder="e.g. HR Executive" /></Row>
      <Row label="Display Name"><Input maxLength={50} value={form.DispDesig} onChange={(e) => setForm({ ...form, DispDesig: e.target.value })} placeholder="Optional display name" /></Row>
      <Row label="Duty Hours"><Input type="number" min="0" max="24" step="0.5" value={form.DUTYHRS} onChange={(e) => setForm({ ...form, DUTYHRS: e.target.value })} placeholder="e.g. 8" /></Row>
      <Row label="Description"><Input maxLength={50} value={form.DESC} onChange={(e) => setForm({ ...form, DESC: e.target.value })} placeholder="Optional description" /></Row>
    </CardContent></Card><div className="flex justify-between mt-4 pt-4 border-t"><Button asChild variant="outline"><Link href="/designations">Cancel</Link></Button><Button disabled={saving} type="submit">{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-2" />{edit ? "Save Changes" : "Create Designation"}</>}</Button></div></form>
  </div>;
}
