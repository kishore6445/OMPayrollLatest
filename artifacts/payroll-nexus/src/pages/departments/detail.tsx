/**
 * departments/detail.tsx — Department detail view
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Pencil, BookOpen } from "lucide-react";
import { Button }     from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }      from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth }    from "@/hooks/use-auth";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

interface Dept { deptcode: string; Deptname: string; desc: string | null }
interface Props { params: { deptcode: string } }

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground pt-0.5 text-right pr-2">{label}</span>
      <span className="col-span-2 text-sm font-medium">
        {value || <span className="italic text-muted-foreground/60 font-normal">—</span>}
      </span>
    </div>
  );
}

export default function DepartmentDetailPage({ params }: Props) {
  const deptcode = decodeURIComponent(params.deptcode);
  const { user } = useAuth();

  const canWrite = (user as any)?.permissions?.includes("departments:write") ||
                   (user as any)?.role === "Admin" ||
                   (user as any)?.roleName === "Admin";

  const { data: dept, isLoading, isError } = useQuery<Dept>({
    queryKey: ["department", deptcode],
    queryFn:  () =>
      fetch(`/api/departments/${encodeURIComponent(deptcode)}`, { headers: hdr() }).then((r) => r.json()),
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading…</div>;
  if (isError || !dept || "error" in dept)
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Department not found or access denied.</p>
        <Button asChild variant="link" className="px-0 mt-2"><Link href="/departments">Back to list</Link></Button>
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/departments"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <PageHeader
          title={dept.Deptname}
          subtitle={`Department · ${dept.deptcode}`}
          icon={<BookOpen className="h-5 w-5" />}
        />
        {canWrite && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href={`/departments/${encodeURIComponent(dept.deptcode)}/edit`}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Department Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <Row label="Code"        value={dept.deptcode} />
          <Row label="Name"        value={dept.Deptname} />
          <Row label="Description" value={dept.desc} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="font-mono text-xs">{dept.deptcode}</Badge>
        <span className="text-xs text-muted-foreground">Shared master — applies across all companies, clients and sites</span>
      </div>
    </div>
  );
}
