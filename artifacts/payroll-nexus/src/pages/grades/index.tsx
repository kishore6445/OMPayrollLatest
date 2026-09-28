import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/use-auth";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });
type Grade = { GradeCode: number; GradeName: string; HraRate: number | null; GradeRemark: string | null };

export default function GradesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const canWrite = (user as any)?.permissions?.includes("departments:write") || (user as any)?.role === "Admin" || (user as any)?.roleName === "Admin";
  const { data, isLoading, isError } = useQuery<{data: Grade[]; total: number}>({
    queryKey: ["grades", search],
    queryFn: async () => { const q = new URLSearchParams({page:"1",pageSize:"200"}); if (search.trim()) q.set("search", search.trim()); const r = await fetch(`/api/grades?${q}`, {headers:hdr()}); if (!r.ok) throw new Error(); return r.json(); },
  });
  const rows = data?.data ?? [];
  return <div className="p-6 space-y-4 max-w-5xl">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <PageHeader title="Grades" subtitle={`${data?.total ?? 0} grade${(data?.total ?? 0)===1?"":"s"} in GRADEMASTER`} icon={<GraduationCap className="h-5 w-5"/>}/>
      {canWrite && <Button asChild><Link href="/grades/new"><Plus className="h-4 w-4 mr-1.5"/>Add Grade</Link></Button>}
    </div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search code or name..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-[120px_1fr_140px_1fr_150px] px-4 py-3 bg-muted/40 text-xs font-medium text-muted-foreground"><span>Code</span><span>Grade Name</span><span>HRA Rate</span><span>Remark</span><span className="text-right">Actions</span></div>
      {isLoading ? <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div> : isError ? <div className="p-6 text-sm text-destructive">Could not load grades.</div> : rows.length===0 ? <div className="p-6 text-sm text-muted-foreground">No grades found.</div> : rows.map(g=><div key={g.GradeCode} className="grid grid-cols-[120px_1fr_140px_1fr_150px] px-4 py-3 border-t items-center text-sm">
        <span className="font-mono">{g.GradeCode}</span><Link href={`/grades/${g.GradeCode}`} className="text-primary font-medium hover:underline">{g.GradeName}</Link><span>{g.HraRate ?? "—"}</span><span className="truncate pr-3">{g.GradeRemark || "—"}</span><div className="text-right space-x-3"><Link href={`/grades/${g.GradeCode}`} className="hover:underline">View</Link>{canWrite&&<Link href={`/grades/${g.GradeCode}/edit`} className="hover:underline">Edit</Link>}</div>
      </div>)}
    </div>
  </div>;
}
