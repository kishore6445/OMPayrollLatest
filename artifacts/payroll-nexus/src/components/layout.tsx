import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Users, Settings, ChevronRight, ChevronDown,
  Building2, Briefcase, MapPin, Menu, X, LogOut, User,
  UsersRound, GitBranch, ShieldCheck, BookOpen, GraduationCap, Tags, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  {
    label: "Home",
    icon: LayoutDashboard,
    children: [
      { label: "My Workspace", href: "/workspace", icon: LayoutDashboard },
    ],
  },
  {
    label: "Setup",
    icon: Settings,
    children: [
      { label: "Companies",  href: "/company",   icon: Building2 },
      { label: "Clients",    href: "/clients",   icon: Briefcase },
      { label: "Departments",  href: "/departments",  icon: BookOpen },
      { label: "Grades",       href: "/grades",       icon: GraduationCap },
      { label: "Designations", href: "/designations", icon: BadgeCheck },
      { label: "Categories",   href: "/categories",  icon: Tags },
    ],
  },
  {
    label: "Workforce",
    icon: UsersRound,
    children: [
      { label: "Employees", href: "/workers", icon: Users },
    ],
  },
  {
    label: "Admin",
    icon: ShieldCheck,
    children: [
      { label: "Users",            href: "/users", icon: Users },
      { label: "Roles & Perms",    href: "/roles", icon: ShieldCheck },
    ],
  },
];

function SidebarLeaf({ item }: { item: NavItem }) {
  const [location] = useLocation();
  const isActive =
    item.href &&
    (location === item.href || (item.href !== "/" && location.startsWith(item.href + "/")));

  return (
    <Link href={item.href!}>
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
      >
        <item.icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "opacity-70"}`} />
        <span className="flex-1 truncate">{item.label}</span>
        {isActive && <div className="w-1 h-1 rounded-full bg-primary shrink-0" />}
      </div>
    </Link>
  );
}

function SidebarSection({ item }: { item: NavItem }) {
  const [location] = useLocation();

  const children = item.children ?? [];
  const activeChild = children.some(
    (c) => c.href && (location === c.href || location.startsWith(c.href + "/"))
  );
  const [open, setOpen] = useState(activeChild);

  if (children.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
          activeChild
            ? "text-primary bg-primary/5"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
      >
        <item.icon className={`h-3.5 w-3.5 shrink-0 ${activeChild ? "text-primary" : ""}`} />
        <span className="flex-1 text-left">{item.label}</span>
        {open
          ? <ChevronDown className="h-3 w-3 opacity-60" />
          : <ChevronRight className="h-3 w-3 opacity-40" />}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 pl-2.5 border-l border-border/40 space-y-0.5">
          {children.map((child) =>
            child.children
              ? <SidebarSection key={child.label} item={child} />
              : <SidebarLeaf key={child.href ?? child.label} item={child} />
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_COLOR: Record<string, string> = {
  "Admin":              "bg-blue-100 text-blue-700",
  "HR Manager":         "bg-emerald-100 text-emerald-700",
  "Finance Executive":  "bg-amber-100 text-amber-700",
  "Finance Manager":    "bg-orange-100 text-orange-700",
  "Compliance Officer": "bg-teal-100 text-teal-700",
  "Payroll Manager":    "bg-violet-100 text-violet-700",
  "Viewer":             "bg-slate-100 text-slate-700",
};

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = (user as any)?.roleName ?? (user as any)?.role ?? "";
  const name = (user as any)?.name ?? (user as any)?.email ?? "User";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const Sidebar = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand */}
      <div className="px-3.5 py-3.5 border-b border-border/50 shrink-0">
        <Link href="/workspace">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-[11px] shrink-0 shadow-sm">
              PN
            </div>
            <div>
              <p className="text-[12px] font-bold leading-tight tracking-tight">Payroll Nexus</p>
              <p className="text-[10px] text-muted-foreground/80">India Payroll Suite</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-0.5 min-h-0">
        {NAV.map((item) =>
          item.children
            ? <SidebarSection key={item.label} item={item} />
            : <SidebarLeaf key={item.href ?? item.label} item={item} />
        )}
      </div>

      {/* User footer */}
      <div className="px-2.5 py-2.5 border-t border-border/50 shrink-0">
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
              ROLE_COLOR[role] ?? "bg-primary/10 text-primary"
            }`}
          >
            {initials || <User className="h-3 w-3" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate leading-tight">{name}</p>
            <p className="text-[10px] text-muted-foreground/80 leading-tight">{role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/50 bg-card/40">
        {Sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-card border-r border-border/50 flex flex-col z-10 shadow-xl">
            <div className="flex justify-end p-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {Sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card/40 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-[9px]">
              PN
            </div>
            <span className="text-sm font-semibold">Payroll Nexus</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
