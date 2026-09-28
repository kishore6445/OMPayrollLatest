/**
 * Branch Detail page
 *
 * Route: /branches/:compid/:branchCode
 * Reads: GET /api/branches/:branchCode?compid=
 */

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, ArrowLeft, Edit, Building2 } from "lucide-react";
import { PageHeader }   from "@/components/ui/page-header";
import { Button }       from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }        from "@/components/ui/badge";
import { Skeleton }     from "@/components/ui/skeleton";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface Branch {
  BranchCode:   number;
  BranchName:   string;
  Baddress:     string | null;
  BManager:     string | null;
  BPhone:       string | null;
  ESIZonecode:  number | null;
  remark:       string | null;
  compid:       number | null;
  comname:      string | null;
  compState:    string | null;
  compCity:     string | null;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value != null && value !== "" ? value : <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export default function BranchDetailPage({ params }: { params: { compid: string; branchCode: string } }) {
  const [, navigate] = useLocation();
  const compid     = params.compid;
  const branchCode = params.branchCode;

  const { data: branch, isLoading, isError } = useQuery<Branch>({
    queryKey: ["branch", compid, branchCode],
    queryFn: () =>
      fetch(`/api/branches/${branchCode}?compid=${compid}`, { headers: hdr() }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !branch) {
    return (
      <div className="p-6">
        <p className="text-destructive">Branch not found or failed to load.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate("/branches")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Branches
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <PageHeader
        title={branch.BranchName}
        subtitle={`Branch · Code ${branch.BranchCode}`}
        icon={<GitBranch className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/branches")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button size="sm" onClick={() => navigate(`/branches/${compid}/${branchCode}/edit`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Branch
            </Button>
          </div>
        }
      />

      {/* Parent Company */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Parent Company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <button
            className="text-sm text-primary hover:underline font-medium text-left"
            onClick={() => navigate(`/company/${compid}`)}
          >
            {branch.comname ?? `Company #${compid}`}
          </button>
          {(branch.compCity || branch.compState) && (
            <p className="text-xs text-muted-foreground mt-1">
              {[branch.compCity, branch.compState].filter(Boolean).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Branch Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Branch Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <Field label="Branch Code"    value={branch.BranchCode} />
          <Field label="Branch Name"    value={branch.BranchName} />
          <Field label="ESI Zone Code"  value={branch.ESIZonecode} />
        </CardContent>
      </Card>

      {/* Contact & Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contact &amp; Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Address"  value={branch.Baddress} />
          <Field label="Manager"  value={branch.BManager} />
          <Field label="Phone"    value={branch.BPhone} />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Remark</p>
            {branch.remark ? (
              <p className="text-sm">{branch.remark}</p>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Code {branch.BranchCode}</Badge>
        <Badge variant="outline">compid {branch.compid}</Badge>
      </div>
    </div>
  );
}
