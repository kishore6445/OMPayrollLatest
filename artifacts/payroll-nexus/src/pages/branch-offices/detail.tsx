/**
 * Branch Office Detail page
 *
 * Route: /branch-offices/:compid/:id  (id = BranchStateID)
 * Reads: GET /api/branch-offices/:id?compid=
 */

import { useLocation } from "wouter";
import { useQuery }    from "@tanstack/react-query";
import { Building2, ArrowLeft, Edit } from "lucide-react";
import { PageHeader }  from "@/components/ui/page-header";
import { Button }      from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Skeleton }    from "@/components/ui/skeleton";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

interface BranchOffice {
  BranchStateID:   number;
  BranchAddress:   string | null;
  BranchCity:      string | null;
  BranchPincode:   number | null;
  BranchState:     string | null;
  BGSTIN:          string | null;
  BranchPhone:     string | null;
  BranchEmail:     string | null;
  BranchWebSite:   string | null;
  BranchStatecode: string | null;
  Compid:          number | null;
  comname:         string | null;
  compState:       string | null;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value != null && value !== "" ? value : <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export default function BranchOfficeDetailPage({ params }: { params: { compid: string; id: string } }) {
  const [, navigate] = useLocation();
  const compid = params.compid;
  const id     = params.id;

  const { data: office, isLoading, isError } = useQuery<BranchOffice>({
    queryKey: ["branch-office", compid, id],
    queryFn: () =>
      fetch(`/api/branch-offices/${id}?compid=${compid}`, { headers: hdr() }).then((r) => {
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

  if (isError || !office) {
    return (
      <div className="p-6">
        <p className="text-destructive">Branch office not found or failed to load.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate("/branches")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Branches
        </Button>
      </div>
    );
  }

  const title = office.BranchState
    ? `${office.BranchState} Office`
    : `Branch Office #${office.BranchStateID}`;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <PageHeader
        title={title}
        subtitle={`Branch Office · ID ${office.BranchStateID}`}
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/branches")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button size="sm" onClick={() => navigate(`/branch-offices/${compid}/${id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Office
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
            {office.comname ?? `Company #${compid}`}
          </button>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <Field label="State ID"     value={office.BranchStateID} />
          <Field label="State"        value={office.BranchState} />
          <Field label="State Code"   value={office.BranchStatecode} />
          <Field label="GSTIN"        value={office.BGSTIN} />
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Address"  value={office.BranchAddress} />
          <Field label="City"     value={office.BranchCity} />
          <Field label="Pincode"  value={office.BranchPincode} />
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Phone"   value={office.BranchPhone} />
          <Field label="Email"   value={office.BranchEmail} />
          <Field label="Website" value={office.BranchWebSite} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Badge variant="secondary">StateID {office.BranchStateID}</Badge>
        <Badge variant="outline">Compid {office.Compid}</Badge>
      </div>
    </div>
  );
}
