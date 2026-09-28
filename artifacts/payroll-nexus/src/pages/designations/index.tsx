import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, BadgeCheck, Loader2, Power, PowerOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });
type Designation = { DESICODE: number; DESINAME: string; DispDesig: string | null; DUTYHRS: number | null; DESC: string | null; is_active: boolean };

export default function DesignationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const canWrite = (user as any)?.permissions?.includes("departments:write") || (user as any)?.role === "Admin" || (user as any)?.roleName === "Admin";
  const { data, isLoading, isError } = useQuery<{ data: Designation[]; total: number }>({
    queryKey: ["designations", search],
    queryFn: async () => {
      const q = new URLSearchParams({ page: "1", pageSize: "200" });
      if (search.trim()) q.set("search", search.trim());
      const r = await fetch(`/api/designations?${q}`, { headers: hdr() });
      if (!r.ok) throw new Error();
      return r.json();
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ code, active }: { code: number; active: boolean }) => {
      const r = await fetch(`/api/designations/${code}/${active ? "activate" : "deactivate"}`, { method: "POST", headers: hdr() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Unable to update designation status");
      return d;
    },
    onSuccess: (_d, v) => {
      toast({ title: v.active ? "Designation activated" : "Designation deactivated" });
      qc.invalidateQueries({ queryKey: ["designations"] });
      qc.invalidateQueries({ queryKey: ["master-designations"] });
    },
    onError: (e: Error) => toast({ title: "Unable to update designation", description: e.message, variant: "destructive" }),
  });
  const rows = data?.data ?? [];
  return <div className="p-6 space-y-4 max-w-6xl">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <PageHeader title="Designations" subtitle={`${data?.total ?? 0} designation${(data?.total ?? 0) === 1 ? "" : "s"} in DESIGNATIONMASTER`} icon={<BadgeCheck className="h-5 w-5" />} />
      {canWrite && <Button asChild><Link href="/designations/new"><Plus className="h-4 w-4 mr-1.5" />Add Designation</Link></Button>}
    </div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search code or designation name..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-[90px_1fr_1fr_100px_90px_1fr_180px] px-4 py-3 bg-muted/40 text-xs font-medium text-muted-foreground"><span>Code</span><span>Designation</span><span>Display Name</span><span>Duty Hrs</span><span>Status</span><span>Description</span><span className="text-right">Actions</span></div>
      {isLoading ? <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : isError ? <div className="p-6 text-sm text-destructive">Could not load designations.</div> : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No designations found.</div> : rows.map((d) => <div key={d.DESICODE} className="grid grid-cols-[90px_1fr_1fr_100px_90px_1fr_180px] px-4 py-3 border-t items-center text-sm">
        <span className="font-mono">{d.DESICODE}</span><span className="font-medium">{d.DESINAME}</span><span>{d.DispDesig || "—"}</span><span>{d.DUTYHRS ?? "—"}</span><span className={d.is_active ? "text-emerald-700" : "text-muted-foreground"}>{d.is_active ? "Active" : "Inactive"}</span><span className="truncate pr-3">{d.DESC || "—"}</span><div className="flex justify-end gap-1">{canWrite && <><Button asChild variant="ghost" size="sm" className="h-8 px-2"><Link href={`/designations/${d.DESICODE}/edit`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Link></Button><Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={toggle.isPending} onClick={() => toggle.mutate({ code: d.DESICODE, active: !d.is_active })}>{d.is_active ? <><PowerOff className="h-3.5 w-3.5 mr-1" />Deactivate</> : <><Power className="h-3.5 w-3.5 mr-1" />Activate</>}</Button></>}</div>
      </div>)}
    </div>
  </div>;
}
