/**
 * departments/form.tsx — Add / Edit Department
 * POST  /api/departments             (create)
 * PATCH /api/departments/:deptcode   (edit)
 */

import { useState, useEffect } from "react";
import { useLocation }  from "wouter";
import { useQuery }     from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, BookOpen } from "lucide-react";
import { Link }         from "wouter";
import { Button }       from "@/components/ui/button";
import { Input }        from "@/components/ui/input";
import { Label }        from "@/components/ui/label";
import { PageHeader }   from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast }     from "@/hooks/use-toast";

const hdr = () => ({
  Authorization:  `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

interface Dept { deptcode: string; Deptname: string; desc: string | null }
interface Props { params: { deptcode?: string } }

function FRow({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string | null; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 py-2 border-b border-border/30 last:border-0">
      <Label className="text-sm pt-2 text-right pr-2 text-muted-foreground">
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

export default function DepartmentFormPage({ params }: Props) {
  const deptcode  = params.deptcode ? decodeURIComponent(params.deptcode) : null;
  const isEdit    = !!deptcode;
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const [form,   setForm]   = useState({ deptcode: "", Deptname: "", desc: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load existing for edit
  const { data: existing, isLoading: loadingExisting } = useQuery<Dept>({
    queryKey: ["department-edit", deptcode],
    queryFn:  () =>
      fetch(`/api/departments/${encodeURIComponent(deptcode!)}`, { headers: hdr() }).then((r) => r.json()),
    enabled: isEdit,
    staleTime: 0,
  });

  useEffect(() => {
    if (existing && !("error" in existing)) {
      setForm({
        deptcode: existing.deptcode ?? "",
        Deptname: existing.Deptname ?? "",
        desc:     existing.desc     ?? "",
      });
    }
  }, [existing]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const err: Record<string, string> = {};
    if (!isEdit && !form.deptcode.trim()) err.deptcode = "Required";
    if (!isEdit && form.deptcode.trim().length > 10) err.deptcode = "Max 10 characters";
    if (!form.Deptname.trim())             err.Deptname = "Required";
    if (form.Deptname.trim().length > 50)  err.Deptname = "Max 50 characters";
    if (form.desc.trim().length > 50)      err.desc     = "Max 50 characters";

    if (Object.keys(err).length > 0) { setErrors(err); return; }

    setSaving(true);
    try {
      const payload: Record<string, string> = { Deptname: form.Deptname.trim() };
      if (!isEdit) payload.deptcode = form.deptcode.trim();
      if (form.desc.trim()) payload.desc = form.desc.trim();

      const url    = isEdit ? `/api/departments/${encodeURIComponent(deptcode!)}` : "/api/departments";
      const method = isEdit ? "PATCH" : "POST";

      const resp = await fetch(url, { method, headers: hdr(), body: JSON.stringify(payload) });
      const data = await resp.json() as Record<string, unknown>;

      if (resp.ok) {
        const code = (data.deptcode ?? deptcode ?? form.deptcode) as string;
        toast({ title: isEdit ? "Department updated" : "Department created", description: code });
        navigate(`/departments/${encodeURIComponent(code)}`);
      } else {
        const msg = (data.error as string) ?? "An unexpected error occurred";
        setErrors({ _form: msg });
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } catch {
      setErrors({ _form: "Network error — please try again" });
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && loadingExisting)
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading department…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={isEdit ? `/departments/${encodeURIComponent(deptcode!)}` : "/departments"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={isEdit ? `Edit Department — ${deptcode}` : "Add Department"}
          subtitle="DEPTMAST"
          icon={<BookOpen className="h-5 w-5" />}
        />
      </div>

      {errors._form && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errors._form}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Department Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <FRow label="Department Code" required error={errors.deptcode}
              hint={isEdit ? "Code cannot be changed after creation" : "Max 10 characters, e.g. HR, ADMIN, IT"}>
              <Input
                className="h-9 font-mono"
                value={form.deptcode}
                onChange={(e) => set("deptcode")(e.target.value.toUpperCase())}
                placeholder="e.g. HR"
                maxLength={10}
                disabled={isEdit}
              />
            </FRow>
            <FRow label="Department Name" required error={errors.Deptname}>
              <Input
                className="h-9"
                value={form.Deptname}
                onChange={(e) => set("Deptname")(e.target.value)}
                placeholder="e.g. Human Resources"
                maxLength={50}
              />
            </FRow>
            <FRow label="Description" error={errors.desc} hint="Optional — max 50 characters">
              <Input
                className="h-9"
                value={form.desc}
                onChange={(e) => set("desc")(e.target.value)}
                placeholder="Brief description of department"
                maxLength={50}
              />
            </FRow>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <Button asChild variant="outline">
            <Link href={isEdit ? `/departments/${encodeURIComponent(deptcode!)}` : "/departments"}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={saving} className="min-w-32">
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              : <><Save className="h-4 w-4 mr-2" />{isEdit ? "Save Changes" : "Create Department"}</>
            }
          </Button>
        </div>
      </form>
    </div>
  );
}
