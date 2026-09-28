/**
 * departments/index.tsx — Department Master list
 * GET /api/departments (paginated, searchable)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, BookOpen, Loader2, FileQuestion } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Badge }    from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth }  from "@/hooks/use-auth";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

interface Dept { deptcode: string; Deptname: string; desc: string | null }

export default function DepartmentsPage() {
  const { user }           = useAuth();
  const [search, setSearch] = useState("");
  const [page,   setPage]   = useState(1);
  const PAGE_SIZE = 50;

  const canWrite = (user as any)?.permissions?.includes("departments:write") ||
                   (user as any)?.role === "Admin" ||
                   (user as any)?.roleName === "Admin";

  const { data, isLoading, isError } = useQuery<{
    data: Dept[]; total: number; page: number; pageSize: number;
  }>({
    queryKey: ["departments", search, page],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) qs.set("search", search.trim());
      return fetch(`/api/departments?${qs}`, { headers: hdr() }).then((r) => r.json());
    },
    staleTime: 30_000,
  });

  const rows  = data?.data  ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader
          title="Departments"
          subtitle={`${total} department${total === 1 ? "" : "s"} in DEPTMAST`}
          icon={<BookOpen className="h-5 w-5" />}
        />
        {canWrite && (
          <Button asChild>
            <Link href="/departments/new">
              <Plus className="h-4 w-4 mr-1.5" /> Add Department
            </Link>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder="Search code or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading departments…
        </div>
      ) : isError ? (
        <div className="text-sm text-destructive py-8">Failed to load departments. Check permissions.</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <FileQuestion className="h-10 w-10 opacity-30" />
          <p className="text-sm">{search ? "No departments match your search." : "No departments yet."}</p>
          {canWrite && !search && (
            <Button asChild variant="outline" size="sm">
              <Link href="/departments/new"><Plus className="h-3.5 w-3.5 mr-1" />Add the first department</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Code</th>
                  <th className="px-4 py-2.5 text-left font-medium">Department Name</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Description</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((d) => (
                  <tr key={d.deptcode} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="font-mono text-xs">{d.deptcode}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/departments/${encodeURIComponent(d.deptcode)}`}>
                        <span className="hover:underline cursor-pointer text-primary">{d.Deptname}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                      {d.desc || <span className="italic opacity-50">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                          <Link href={`/departments/${encodeURIComponent(d.deptcode)}`}>View</Link>
                        </Button>
                        {canWrite && (
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                            <Link href={`/departments/${encodeURIComponent(d.deptcode)}/edit`}>Edit</Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>{total} total · page {page} of {pages}</span>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
