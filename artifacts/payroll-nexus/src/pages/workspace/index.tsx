import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Building2, GitBranch, Briefcase, MapPin, Users,
  ChevronRight, ShieldCheck, UserCog,
} from "lucide-react";

interface QuickLink {
  label: string;
  desc: string;
  href: string;
  icon: React.ElementType;
}

const QUICK_LINKS: QuickLink[] = [
  { label: "Companies",       desc: "COMPANYMAST — company master records",           href: "/company",  icon: Building2 },
  { label: "Branches",        desc: "BRANCH + ZONE_MASTER — branch and zone records", href: "/branches", icon: GitBranch },
  { label: "Clients",         desc: "CLIENTMASTER — client master records",           href: "/clients",  icon: Briefcase },
  { label: "Sites",           desc: "UNITMASTER — unit / site master records",        href: "/sites",    icon: MapPin },
  { label: "Employees",       desc: "EMPMAST — employee master (read-only)",          href: "/workers",  icon: Users },
  { label: "Users & Roles",   desc: "app_users / app_roles / app_permissions",        href: "/users",    icon: UserCog },
  { label: "Roles & Perms",   desc: "RBAC permission sets per role",                  href: "/roles",    icon: ShieldCheck },
];

export default function WorkspacePage() {
  const { user } = useAuth();

  const hora = new Date().getHours();
  const greeting =
    hora < 12 ? "Good morning" : hora < 17 ? "Good afternoon" : "Good evening";
  const firstName = ((user as any)?.name ?? "").split(" ")[0] || "there";

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {(user as any)?.roleName ?? ""} · PayrollOM
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Modules
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              <div className="group flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm cursor-pointer transition-all">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <link.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{link.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{link.desc}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
