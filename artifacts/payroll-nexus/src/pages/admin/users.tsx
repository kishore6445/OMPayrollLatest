/**
 * admin/users.tsx — User Management
 *
 * Connects to: GET/POST/PATCH /api/users, POST activate/deactivate/reset-password
 * API response shape: { id, username, full_name, email, role, is_active,
 *                       must_change_password, created_at, last_login }
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  UserCog, Plus, Search, Loader2, MoreVertical,
  CheckCircle2, XCircle, KeyRound, Pencil, UserX, UserCheck,
  ShieldAlert,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard }  from "@/components/ui/stat-card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast }  from "@/hooks/use-toast";
import { useAuth }   from "@/hooks/use-auth";
import { fmtDate }   from "@/lib/fmt";
import HRScopeSection, { type ScopeData, EMPTY_SCOPE } from "./hr-scope-section";

const EMPLOYEE_ROLE = "Employee";
const UNRESTRICTED_ROLES = new Set(["Admin", "Payroll Manager"]);
const usesManualScope = (role: string) =>
  Boolean(role) && role !== EMPLOYEE_ROLE && !UNRESTRICTED_ROLES.has(role);

const hdr = () => ({
  "Content-Type": "application/json",
  Authorization:  `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
});

const api = (path: string, opts?: RequestInit) =>
  fetch(`/api${path}`, { ...opts, headers: { ...hdr(), ...(opts?.headers ?? {}) } });

// ── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
  company_display: string | null;
  client_display: string | null;
  branch_display: string | null;
  unit_display: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string | null;
  last_login: string | null;
}
interface Role { id: number; role_name: string; description: string | null }
interface EmployeeOption {
  EmpCode: string;
  EmpName: string;
  compid: number;
  clientcode: number | null;
  branchcode: number | null;
  unitcode: string | null;
  Clientname: string | null;
  BranchName: string | null;
  comname: string | null;
  has_login: boolean;
}

// ── Role badge colours ───────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  "Admin":              "bg-blue-100 text-blue-700 border-blue-200",
  "Employee":           "bg-cyan-100 text-cyan-700 border-cyan-200",
  "HR Manager":         "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Finance Executive":  "bg-amber-100 text-amber-700 border-amber-200",
  "Finance Manager":    "bg-orange-100 text-orange-700 border-orange-200",
  "Compliance Officer": "bg-teal-100 text-teal-700 border-teal-200",
  "Payroll Manager":    "bg-violet-100 text-violet-700 border-violet-200",
  "Viewer":             "bg-slate-100 text-slate-600 border-slate-200",
};

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{role}</span>;
}

function StatusDot({ active }: { active: boolean }) {
  return active
    ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
    : <span className="flex items-center gap-1 text-rose-500 text-xs"><XCircle className="h-3.5 w-3.5" />Inactive</span>;
}

// ── Form field ────────────────────────────────────────────────────────────────

function FF({ label, required, error, children }: {
  label: string; required?: boolean; error?: string | null; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Add User Dialog ───────────────────────────────────────────────────────────

function normalizeScopeData(raw: any): ScopeData {
  const companies = Array.from(new Set(
    (Array.isArray(raw?.companies) ? raw.companies : [])
      .map((c: any) => Number(typeof c === "object" && c !== null ? (c.compids ?? c.compid) : c))
      .filter((n: number) => Number.isInteger(n) && n > 0),
  ));

  const branches = (Array.isArray(raw?.branches) ? raw.branches : [])
    .map((b: any) => ({ compid: Number(b.compid), branchcode: Number(b.branchcode) }))
    .filter((b: any) => Number.isInteger(b.compid) && b.compid > 0 && Number.isInteger(b.branchcode));

  const clients = (Array.isArray(raw?.clients) ? raw.clients : [])
    .map((c: any) => ({ compid: Number(c.compid), branchcode: Number(c.branchcode), clientcode: Number(c.clientcode) }))
    .filter((c: any) => Number.isInteger(c.compid) && c.compid > 0 && Number.isInteger(c.clientcode));

  const units = (Array.isArray(raw?.units) ? raw.units : [])
    .map((u: any) => ({ compid: Number(u.compid), unitcode: String(u.unitcode ?? "").trim() }))
    .filter((u: any) => Number.isInteger(u.compid) && u.compid > 0 && Boolean(u.unitcode));

  return { companies, branches, clients, units };
}

function validateManualScope(scope: ScopeData): string | null {
  const normalized = normalizeScopeData(scope);
  if (normalized.companies.length === 0) return "Select at least one organization";
  const missingClient = normalized.companies.find((compid) =>
    !normalized.units.some((u) => Number(u.compid) === Number(compid)),
  );
  if (missingClient != null) return "Select at least one client under each selected organization";
  return null;
}

function AddUserDialog({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "", username: "", email: "", role: "", password: "", confirmPassword: "",
  });
  const [scope, setScope] = useState<ScopeData>(EMPTY_SCOPE);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const isEmployee = form.role === EMPLOYEE_ROLE;
  const isScopedRole = usesManualScope(form.role);
  const { data: employeeOptions = [], isFetching: employeeLoading } = useQuery<EmployeeOption[]>({
    queryKey: ["user-employee-options", employeeSearch],
    queryFn: () => api(`/users/employee-options?search=${encodeURIComponent(employeeSearch)}`).then((r) => r.json()),
    enabled: open && isEmployee && employeeSearch.trim().length >= 2,
    staleTime: 30_000,
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function reset() {
    setForm({ full_name: "", username: "", email: "", role: "", password: "", confirmPassword: "" });
    setScope(EMPTY_SCOPE);
    setEmployeeSearch("");
    setSelectedEmployee(null);
    setErr({});
  }

  useEffect(() => {
    if (!isEmployee) {
      setEmployeeSearch("");
      setSelectedEmployee(null);
    }
    if (!isScopedRole) setScope(EMPTY_SCOPE);
  }, [isEmployee, isScopedRole]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.full_name.trim())  e2.full_name  = "Required";
    if (!form.username.trim())   e2.username   = "Required";
    if (!form.role)              e2.role       = "Required";
    if (isEmployee && !selectedEmployee) e2.employee = "Select an employee";
    if (isScopedRole) {
      const scopeError = validateManualScope(scope);
      if (scopeError) e2.scope = scopeError;
    }
    if (!form.password)          e2.password   = "Required";
    else if (form.password.length < 8) e2.password = "Min 8 characters";
    if (form.password !== form.confirmPassword) e2.confirmPassword = "Passwords do not match";
    if (Object.keys(e2).length) { setErr(e2); return; }

    setSaving(true);
    setErr({});
    try {
      const resp = await api("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          username:  form.username.trim(),
          email:     form.email.trim() || undefined,
          role:      form.role,
          password:  form.password,
          employee_code: isEmployee ? selectedEmployee?.EmpCode : undefined,
          compid:         isEmployee ? selectedEmployee?.compid  : undefined,
          scope:          isScopedRole ? scope : undefined,
        }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (!resp.ok) {
        const msg = String(data.error ?? "Unexpected error");
        if (msg.toLowerCase().includes("username")) setErr({ username: msg });
        else if (msg.toLowerCase().includes("email")) setErr({ email: msg });
        else if (msg.toLowerCase().includes("password")) setErr({ password: msg });
        else if (msg.toLowerCase().includes("role")) setErr({ role: msg });
        else setErr({ _form: msg });
        return;
      }


      toast({ title: "User created", description: `${form.full_name} (${form.username})` });
      setOpen(false);
      reset();
      onCreated();
    } catch (error) {
      setErr({ _form: error instanceof Error ? error.message : "Network error — please try again" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />Add User
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          {err._form && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {err._form}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FF label="Full Name" required error={err.full_name}>
                <Input className="h-8 text-xs" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} placeholder="Ravi Kumar" />
              </FF>
              <FF label="Username" required error={err.username}>
                <Input
                  className="h-8 text-xs font-mono"
                  value={form.username}
                  onChange={(e) => set("username")(e.target.value.toLowerCase())}
                  placeholder={isEmployee ? "Auto-filled from employee code" : "ravi.kumar"}
                  readOnly={isEmployee}
                />
              </FF>
            </div>
            <FF label="Email" error={err.email}>
              <Input className="h-8 text-xs" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="ravi@company.com" />
            </FF>
            <FF label="Role" required error={err.role}>
              <Select value={form.role} onValueChange={set("role")}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select role…" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.role_name} value={r.role_name} className="text-xs">{r.role_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FF>
            {isEmployee && (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <FF label="Employee" required error={err.employee}>
                  <Input
                    className="h-8 text-xs"
                    value={employeeSearch}
                    onChange={(e) => { setEmployeeSearch(e.target.value); setSelectedEmployee(null); }}
                    placeholder="Search by employee code or name…"
                  />
                </FF>
                {employeeLoading && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />Searching employees…
                  </p>
                )}
                {!employeeLoading && employeeSearch.trim().length >= 2 && !selectedEmployee && employeeOptions.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
                    {employeeOptions.map((emp) => (
                      <button
                        type="button"
                        key={`${emp.compid}:${emp.EmpCode}`}
                        disabled={emp.has_login}
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setEmployeeSearch(`${emp.EmpCode} — ${emp.EmpName}`);
                          setForm((f) => ({
                            ...f,
                            full_name: emp.EmpName || f.full_name,
                            username: emp.EmpCode,
                          }));
                        }}
                        className="w-full text-left px-2.5 py-2 text-xs hover:bg-muted disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <div className="font-medium">{emp.EmpCode} — {emp.EmpName}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {emp.comname ?? `Company ${emp.compid}`} · {emp.Clientname ?? "No client"} · {emp.BranchName ?? "No branch"}
                          {emp.has_login ? " · Login already exists" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedEmployee && (
                  <div className="rounded bg-muted/40 px-2.5 py-2 text-[11px]">
                    <div><b>Employee:</b> {selectedEmployee.EmpCode} — {selectedEmployee.EmpName}</div>
                    <div><b>Client:</b> {selectedEmployee.Clientname ?? "—"}</div>
                    <div><b>Branch:</b> {selectedEmployee.BranchName ?? "—"}</div>
                    <div><b>Unit:</b> {selectedEmployee.unitcode ?? "—"}</div>
                    <div className="mt-1 text-muted-foreground">Client/branch/unit are derived automatically from EMPMAST.</div>
                  </div>
                )}
              </div>
            )}
            {isScopedRole && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Assigned Client(s)</Label>
                <HRScopeSection value={scope} onChange={setScope} roleLabel={form.role} />
                {err.scope && <p className="text-xs text-destructive">{err.scope}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FF label="Password" required error={err.password}>
                <Input className="h-8 text-xs" type="password" value={form.password} onChange={(e) => set("password")(e.target.value)} placeholder="Min 8 chars" />
              </FF>
              <FF label="Confirm Password" error={err.confirmPassword}>
                <Input className="h-8 text-xs" type="password" value={form.confirmPassword} onChange={(e) => set("confirmPassword")(e.target.value)} placeholder="Repeat password" />
              </FF>
            </div>
            <p className="text-[10px] text-muted-foreground">
              User will be required to change password on first login.
            </p>
            <Button type="submit" size="sm" className="w-full" disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</> : "Create User"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Edit User Dialog ──────────────────────────────────────────────────────────

function EditUserDialog({
  user, roles, currentUserId, onSaved,
}: {
  user: User; roles: Role[]; currentUserId: number; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: user.full_name ?? "",
    email:     user.email    ?? "",
    role:      user.role,
  });
  const [scope, setScope] = useState<ScopeData>(EMPTY_SCOPE);
  const [scopeTouched, setScopeTouched] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isSelf        = user.id === currentUserId;
  const isSystemAdmin = user.id === 1;
  const effectiveRole = isSelf ? user.role : form.role;
  const hasManualScope = usesManualScope(effectiveRole);

  // Load the user's current scope whenever Edit is open and the effective role
  // requires manual Organization / Client scoping. This intentionally depends on
  // hasManualScope (not only the role originally stored on the user), so changing
  // an existing Employee user to HR Manager / Finance / Viewer in this dialog
  // immediately reloads the user's existing/derived Organization + Client context
  // instead of forcing the admin to select it again from scratch.
  useEffect(() => {
    if (!open) return;
    setScopeTouched(false);
    if (!hasManualScope) {
      setScope(EMPTY_SCOPE);
      return;
    }

    let cancelled = false;
    api(`/users/${user.id}/scope`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load existing access scope");
        return r.json();
      })
      .then((d: Record<string, unknown>) => {
        if (!cancelled) {
          const normalized = normalizeScopeData(d);
          setScope(normalized);
          if (!validateManualScope(normalized)) {
            setErr((prev) => ({ ...prev, scope: "" }));
          }
        }
      })
      .catch(() => {
        // Role-only edits must still be allowed even when legacy scope cannot be loaded.
        // Keep the existing database scope untouched unless the admin explicitly edits it.
        if (!cancelled) {
          setScope(EMPTY_SCOPE);
              }
      });

    return () => { cancelled = true; };
  }, [open, user.id, hasManualScope]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr({});

    // Validate Organization / Client changes before updating the user record.
    // This avoids a partial save where name/role is changed but the requested
    // Client assignment is rejected afterwards.
    if (hasManualScope && scopeTouched) {
      const scopeError = validateManualScope(scope);
      if (scopeError) {
        setErr({ scope: scopeError });
        return;
      }
    }

    setSaving(true);
    try {
      const resp = await api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: form.full_name.trim() || undefined,
          email:     form.email.trim()     || null,
          role:      isSelf ? undefined    : form.role,
          scope:     hasManualScope && scopeTouched ? normalizeScopeData(scope) : undefined,
        }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (!resp.ok) {
        const msg = String(data.error ?? "Unexpected error");
        if (msg.toLowerCase().includes("email")) setErr({ email: msg });
        else setErr({ _form: msg });
        return;
      }


      toast({
        title: scopeTouched ? "User and Client assignment updated" : "User updated",
        description: scopeTouched ? "The selected Organization / Client access is now saved for this user." : undefined,
      });
      setOpen(false);
      onSaved();
    } catch (error) {
      setErr({ _form: error instanceof Error ? error.message : "Network error — please try again" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenuItem onSelect={(e) => {
        e.preventDefault();
        setErr({});
        setScope(EMPTY_SCOPE);
        setScopeTouched(false);
        setForm({ full_name: user.full_name ?? "", email: user.email ?? "", role: user.role });
        setOpen(true);
      }}>
        <Pencil className="h-3.5 w-3.5 mr-2" />Edit
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User — {user.username}</DialogTitle>
          </DialogHeader>
          {isSystemAdmin && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              System administrator — role and username cannot be changed.
            </div>
          )}
          {err._form && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {err._form}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4 pt-1">
            <FF label="Full Name" required error={err.full_name}>
              <Input className="h-8 text-xs" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} />
            </FF>
            <FF label="Email" error={err.email}>
              <Input className="h-8 text-xs" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="Leave blank to clear" />
            </FF>
            {!isSelf && !isSystemAdmin && (
              <FF label="Role" error={err.role}>
                <Select value={form.role} onValueChange={set("role")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.role_name} value={r.role_name} className="text-xs">{r.role_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FF>
            )}
            {isSelf && (
              <p className="text-[10px] text-muted-foreground italic">You cannot change your own role.</p>
            )}
            {hasManualScope && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Organization & Assigned Client(s)</Label>
                <p className="text-[10px] text-muted-foreground">
                  Existing assignments are preselected. Add/remove Organizations and choose the required Clients under each, then click Save Changes.
                </p>
                <HRScopeSection value={scope} onChange={(next) => { setScope(next); setScopeTouched(true); setErr((prev) => ({ ...prev, scope: "" })); }} roleLabel={effectiveRole} />
                {err.scope && <p className="text-xs text-destructive">{err.scope}</p>}
              </div>
            )}
            <Button type="submit" size="sm" className="w-full" disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Reset Password Dialog ─────────────────────────────────────────────────────

function ResetPasswordDialog({
  user, onDone,
}: {
  user: User; onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [pw,  setPw]  = useState("");
  const [pw2, setPw2] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr({});
    if (pw.length < 8)   { setErr({ pw: "Min 8 characters" }); return; }
    if (pw !== pw2)      { setErr({ pw2: "Passwords do not match" }); return; }
    setSaving(true);
    try {
      const resp = await api(`/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pw }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (!resp.ok) {
        setErr({ _form: String(data.error ?? "Error") });
        return;
      }
      toast({ title: "Password reset", description: `${user.full_name ?? user.username} must set a new password on next login.` });
      setOpen(false); setPw(""); setPw2(""); onDone();
    } catch {
      setErr({ _form: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <KeyRound className="h-3.5 w-3.5 mr-2" />Reset Password
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPw(""); setPw2(""); setErr({}); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password — {user.full_name ?? user.username}</DialogTitle>
          </DialogHeader>
          {err._form && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err._form}</div>
          )}
          <form onSubmit={submit} className="space-y-3 pt-1">
            <FF label="New Password" required error={err.pw}>
              <Input className="h-8 text-xs" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters" />
            </FF>
            <FF label="Confirm New Password" error={err.pw2}>
              <Input className="h-8 text-xs" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" />
            </FF>
            <p className="text-[10px] text-muted-foreground">
              The user will be required to change their password on next login.
            </p>
            <Button type="submit" size="sm" className="w-full" disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Resetting…</> : "Reset Password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me }   = useAuth();
  const { toast }      = useToast();
  const qc             = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const PAGE_SIZE = 50;

  const currentUserId = (me as any)?.id ? Number((me as any).id) : -1;

  const { data, isLoading } = useQuery<{
    data: User[]; total: number; page: number; pageSize: number;
  }>({
    queryKey: ["users", search, page],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) qs.set("search", search.trim());
      return api(`/users?${qs}`).then((r) => r.json());
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: () => api("/roles").then((r) => r.json()),
  });

  const users = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalAll = total;
  const activeCount      = users.filter((u) => u.is_active).length;
  const inactiveCount    = users.filter((u) => !u.is_active).length;
  const mustChangePwCount = users.filter((u) => u.must_change_password).length;

  function invalidate() { qc.invalidateQueries({ queryKey: ["users"] }); }

  const activateMutation = useMutation({
    mutationFn: (userId: number) =>
      api(`/users/${userId}/activate`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (d: Record<string, unknown>) => {
      if (d.error) { toast({ title: "Error", description: String(d.error), variant: "destructive" }); return; }
      toast({ title: "User activated" }); invalidate();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: number) =>
      api(`/users/${userId}/deactivate`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (d: Record<string, unknown>) => {
      if (d.error) { toast({ title: "Error", description: String(d.error), variant: "destructive" }); return; }
      toast({ title: "User deactivated" }); invalidate();
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader
          title="User Management"
          subtitle="System users, roles, and access control"
          icon={<UserCog className="h-5 w-5" />}
        />
        <AddUserDialog roles={roles} onCreated={invalidate} />
      </div>

      {/* Stat cards — computed from current page, not all users */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Users"       value={totalAll}        icon={<UserCog className="h-4 w-4" />} loading={isLoading} />
        <StatCard title="Active"            value={activeCount}     loading={isLoading} />
        <StatCard title="Inactive"          value={inactiveCount}   loading={isLoading} />
        <StatCard title="Must Change PW"    value={mustChangePwCount} loading={isLoading} />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search name, username, email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 text-xs px-3 shrink-0">
          <Link href="/roles">Roles &amp; Permissions</Link>
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {search ? "No users match your search." : "No users found."}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Username</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Email</th>
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Client / Access</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium leading-tight">{u.full_name ?? u.username}</div>
                      {u.must_change_password && (
                        <span className="text-[10px] text-amber-600">Must change password</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {u.username}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                      {u.email || <span className="italic opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-2.5 text-xs hidden md:table-cell max-w-[280px]">
                      {UNRESTRICTED_ROLES.has(u.role) ? (
                        <span className="font-medium text-emerald-700">All clients</span>
                      ) : u.client_display ? (
                        <div className="min-w-0">
                          <div className="font-medium truncate" title={u.client_display}>{u.client_display}</div>
                          {(u.branch_display || u.unit_display || u.company_display) && (
                            <div
                              className="text-[10px] text-muted-foreground truncate"
                              title={[u.company_display, u.branch_display, u.unit_display ? `Unit ${u.unit_display}` : null].filter(Boolean).join(" · ")}
                            >
                              {[u.branch_display, u.unit_display ? `Unit ${u.unit_display}` : null].filter(Boolean).join(" · ") || u.company_display}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="italic text-muted-foreground opacity-60">No client assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusDot active={u.is_active} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                      {u.last_login ? fmtDate(u.last_login) : <span className="italic opacity-40">Never</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs w-44">
                          <EditUserDialog
                            user={u}
                            roles={roles}
                            currentUserId={currentUserId}
                            onSaved={invalidate}
                          />
                          <ResetPasswordDialog user={u} onDone={invalidate} />
                          <DropdownMenuSeparator />
                          {u.is_active ? (
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                              disabled={u.id === currentUserId || u.id === 1 || deactivateMutation.isPending}
                              onSelect={() => deactivateMutation.mutate(u.id)}
                            >
                              <UserX className="h-3.5 w-3.5 mr-2" />
                              {u.id === currentUserId ? "Cannot deactivate self" : "Deactivate"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                              disabled={activateMutation.isPending}
                              onSelect={() => activateMutation.mutate(u.id)}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-2" />Activate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</Button>
                <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
