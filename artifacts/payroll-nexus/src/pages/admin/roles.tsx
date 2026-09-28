/**
 * admin/roles.tsx — Roles & Permissions management
 *
 * Roles are defined by the seed script. This page shows each role's
 * module/action permissions matrix for reference.
 *
 * Connects to:
 *   GET /api/roles
 *   GET /api/roles/:roleName/permissions
 *   GET /api/permissions
 *   POST /api/roles
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield, ChevronRight, ChevronDown, Loader2,
  CheckCircle2, Info, Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Textarea }   from "@/components/ui/textarea";
import { Label }      from "@/components/ui/label";
import { Checkbox }   from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast }   from "@/hooks/use-toast";
import { useAuth }    from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});
const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { ...hdr(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
  return data;
};

interface Role { id: number; role_name: string; description: string | null }
interface Perm { module: string; action: string; allowed: boolean }
interface RolePerms { roleName: string; permissions: Perm[] }

// ── Colour map ────────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  "Admin":              "bg-blue-100 text-blue-700 border-blue-200",
  "HR Manager":         "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Finance Executive":  "bg-amber-100 text-amber-700 border-amber-200",
  "Finance Manager":    "bg-orange-100 text-orange-700 border-orange-200",
  "Compliance Officer": "bg-teal-100 text-teal-700 border-teal-200",
  "Payroll Manager":    "bg-violet-100 text-violet-700 border-violet-200",
  "Viewer":             "bg-slate-100 text-slate-600 border-slate-200",
};

// ── Module labels ─────────────────────────────────────────────────────────────
const MODULE_LABEL: Record<string, string> = {
  auth:         "Authentication",
  users:        "User Management",
  company:      "Company Master",
  branches:     "Branches & Zones",
  clients:      "Clients & Sites",
  units:        "Units (UNITMASTER)",
  departments:  "Departments",
  workers:      "Employees (EMPMAST)",
  attendance:   "Attendance",
  leave:        "Leave",
  advances:     "Advances",
  arrears:      "Arrears",
  payroll:      "Payroll",
  statutory:    "Statutory Compliance",
  challans:     "Challans",
  billing:      "Billing",
  collections:  "Collections",
  finance:      "Finance",
  reports:      "Reports",
  masters:      "Masters (Designations, Grades)",
  audit:        "Audit Logs",
  shifts:       "Shifts",
};

const ACTION_ORDER = ["read", "write", "export", "delete"];

// ── Permission chip ───────────────────────────────────────────────────────────
function ActionChip({ action }: { action: string }) {
  const colors: Record<string, string> = {
    read:   "bg-sky-50 text-sky-700 border-sky-200",
    write:  "bg-violet-50 text-violet-700 border-violet-200",
    export: "bg-amber-50 text-amber-700 border-amber-200",
    delete: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium ${colors[action] ?? "bg-muted text-muted-foreground"}`}>
      <CheckCircle2 className="h-2.5 w-2.5" />{action}
    </span>
  );
}

// ── Per-role permissions panel ────────────────────────────────────────────────
function RolePermissions({ roleName }: { roleName: string }) {
  const { data, isLoading } = useQuery<RolePerms>({
    queryKey: ["role-perms", roleName],
    queryFn:  () => api(`/roles/${encodeURIComponent(roleName)}/permissions`),
    staleTime: 120_000,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 pl-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading permissions…
    </div>
  );

  const perms = data?.permissions ?? [];
  if (perms.length === 0) return (
    <p className="text-xs text-muted-foreground pl-2 py-3">No permissions assigned.</p>
  );

  // Group by module
  const grouped = perms.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p.action);
    return acc;
  }, {});

  // Sort modules by label; sort actions by order
  const sortedModules = Object.entries(grouped).sort((a, b) =>
    (MODULE_LABEL[a[0]] ?? a[0]).localeCompare(MODULE_LABEL[b[0]] ?? b[0])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-2 pt-1 pb-2">
      {sortedModules.map(([mod, actions]) => (
        <div key={mod} className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground min-w-36 pt-0.5">{MODULE_LABEL[mod] ?? mod}</span>
          <div className="flex flex-wrap gap-1">
            {ACTION_ORDER.filter((a) => actions.includes(a)).map((a) => (
              <ActionChip key={a} action={a} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Role card ─────────────────────────────────────────────────────────────────
function RoleCard({ role }: { role: Role }) {
  const [expanded, setExpanded] = useState(false);
  const colorCls = ROLE_COLOR[role.role_name] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm font-semibold">{role.role_name}</CardTitle>
            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${colorCls}`}>
              {role.role_name === "Admin" ? "System · Full access" : "System"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? "Hide" : "Permissions"}
          </Button>
        </div>
        {role.description && (
          <p className="text-xs text-muted-foreground pl-6">{role.description}</p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="border-t border-border/40 bg-muted/20 pt-3 pb-3">
          <RolePermissions roleName={role.role_name} />
        </CardContent>
      )}
    </Card>
  );
}

// ── Add role dialog ───────────────────────────────────────────────────────────
function AddRoleDialog({ permissionCatalog }: { permissionCatalog: Perm[] }) {
  const [open, setOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { toast } = useToast();

  const grouped = permissionCatalog.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p.action);
    return acc;
  }, {});
  const modules = Object.entries(grouped).sort((a, b) =>
    (MODULE_LABEL[a[0]] ?? a[0]).localeCompare(MODULE_LABEL[b[0]] ?? b[0])
  );

  const createRole = useMutation({
    mutationFn: () => api("/roles", {
      method: "POST",
      body: JSON.stringify({
        roleName: roleName.trim(),
        description: description.trim(),
        permissions: Array.from(selected).map((key) => {
          const [module, action] = key.split(":");
          return { module, action };
        }),
      }),
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["roles"] });
      toast({ title: "Role created", description: `${roleName.trim()} is now available for User assignment.` });
      setRoleName("");
      setDescription("");
      setSelected(new Set());
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: "Could not create role", description: e.message, variant: "destructive" }),
  });

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1.5" />Add Role</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Role</DialogTitle>
          <DialogDescription>Create a role and choose exactly what that role can access.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="role-name">Role Name *</Label>
            <Input id="role-name" value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. HR Executive" maxLength={50} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role responsible for?" maxLength={250} rows={2} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Permissions *</Label>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            </div>
            <div className="rounded-lg border divide-y">
              {modules.map(([mod, actions]) => (
                <div key={mod} className="grid grid-cols-[minmax(180px,1fr)_2fr] gap-3 px-3 py-2.5 items-start">
                  <div className="text-sm font-medium">{MODULE_LABEL[mod] ?? mod}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {ACTION_ORDER.filter((a) => actions.includes(a)).map((action) => {
                      const key = `${mod}:${action}`;
                      return (
                        <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                          <Checkbox checked={selected.has(key)} onCheckedChange={(v) => toggle(key, v === true)} />
                          <span className="capitalize">{action}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={createRole.isPending}>Cancel</Button>
          <Button
            onClick={() => createRole.mutate()}
            disabled={createRole.isPending || roleName.trim().length < 2 || selected.size === 0}
          >
            {createRole.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RolesPage() {
  const { user } = useAuth();
  const canCreateRole = (user as any)?.roleName === "Admin" || (user as any)?.role === "Admin" || (user as any)?.permissions?.includes("users:write");
  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn:  () => api("/roles"),
    staleTime: 300_000,
  });
  const { data: permissionCatalog = [] } = useQuery<Perm[]>({
    queryKey: ["permission-catalog"],
    queryFn: () => api("/permissions"),
    staleTime: 300_000,
    enabled: canCreateRole,
  });

  // Deduplicate (API already dedupes but guard here too)
  const deduped = roles.filter((r, i, arr) =>
    arr.findIndex((x) => x.role_name === r.role_name) === i
  );

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Roles &amp; Permissions"
          subtitle={`${deduped.length} roles · click a role to view its permissions`}
          icon={<Shield className="h-5 w-5" />}
        />
        {canCreateRole && <AddRoleDialog permissionCatalog={permissionCatalog} />}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
        <span>
          Admins can create a new role and choose its module permissions here. Once created,
          the role immediately becomes available in User Management for assignment.
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />Loading roles…
        </div>
      ) : (
        <div className="space-y-3">
          {deduped.map((r) => <RoleCard key={r.role_name} role={r} />)}
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-2 border-t border-border/40">
        <span className="text-[11px] text-muted-foreground font-medium">Action legend:</span>
        {["read", "write", "export", "delete"].map((a) => <ActionChip key={a} action={a} />)}
      </div>
    </div>
  );
}
