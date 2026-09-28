import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { setupAuth } from "@/lib/auth-setup";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

// Auth
import LoginPage        from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";

// Workspace
import WorkspacePage    from "@/pages/workspace";

// Setup / Masters
import CompanyListPage   from "@/pages/company/index";
import CompanyFormPage   from "@/pages/company/form";
import CompanyDetailPage from "@/pages/company/detail";
import BranchesPage        from "@/pages/branches/index";
import BranchDetailPage    from "@/pages/branches/detail";
import BranchFormPage      from "@/pages/branches/form";
import BranchOfficeDetailPage from "@/pages/branch-offices/detail";
import BranchOfficeFormPage   from "@/pages/branch-offices/form";
import SitesPage         from "@/pages/sites/index";
import UnitsPage         from "@/pages/units/index";
import UnitDetailPage    from "@/pages/units/detail";
import UnitFormPage      from "@/pages/units/form";

// Departments
import DepartmentsPage      from "@/pages/departments/index";
import DepartmentDetailPage from "@/pages/departments/detail";
import DepartmentFormPage   from "@/pages/departments/form";

// Grades
import GradesPage from "@/pages/grades/index";
import GradeDetailPage from "@/pages/grades/detail";
import GradeFormPage from "@/pages/grades/form";

// Designations
import DesignationsPage from "@/pages/designations/index";
import DesignationFormPage from "@/pages/designations/form";

// Categories
import CategoriesPage from "@/pages/categories/index";
import CategoryDetailPage from "@/pages/categories/detail";
import CategoryFormPage from "@/pages/categories/form";

// Workforce
import WorkersPage        from "@/pages/workers/index";
import WorkerDetailPage   from "@/pages/workers/detail";
import WorkerFormPage     from "@/pages/workers/form";

// Admin
import UsersPage        from "@/pages/admin/users";
import RolesPage        from "@/pages/admin/roles";

setupAuth();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold animate-pulse">
            PN
          </div>
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  if (user.mustChangePassword && (rest as any).path !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return (
    <Route {...rest}>
      {(params) => (
        <Layout>
          <Component params={params} />
        </Layout>
      )}
    </Route>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route path="/">{() => <Redirect to="/workspace" />}</Route>

      {/* Workspace */}
      <ProtectedRoute path="/workspace" component={WorkspacePage} />

      {/* Company master */}
      <ProtectedRoute path="/company/new"         component={CompanyFormPage} />
      <ProtectedRoute path="/company/:compid/edit" component={CompanyFormPage} />
      <ProtectedRoute path="/company/:compid"      component={CompanyDetailPage} />
      <ProtectedRoute path="/company"              component={CompanyListPage} />

      {/* Branches — full CRUD */}
      <ProtectedRoute path="/branches/new"                        component={BranchFormPage} />
      <ProtectedRoute path="/branches/:compid/:branchCode/edit"   component={BranchFormPage} />
      <ProtectedRoute path="/branches/:compid/:branchCode"        component={BranchDetailPage} />
      <ProtectedRoute path="/branches"                            component={BranchesPage} />

      {/* Branch Offices — full CRUD */}
      <ProtectedRoute path="/branch-offices/new"              component={BranchOfficeFormPage} />
      <ProtectedRoute path="/branch-offices/:compid/:id/edit" component={BranchOfficeFormPage} />
      <ProtectedRoute path="/branch-offices/:compid/:id"      component={BranchOfficeDetailPage} />


      {/* Departments — full CRUD */}
      <ProtectedRoute path="/departments/new"                component={DepartmentFormPage} />
      <ProtectedRoute path="/departments/:deptcode/edit"     component={DepartmentFormPage} />
      <ProtectedRoute path="/departments/:deptcode"          component={DepartmentDetailPage} />
      <ProtectedRoute path="/departments"                    component={DepartmentsPage} />

      {/* Grades — GRADEMASTER */}
      <ProtectedRoute path="/grades/new" component={GradeFormPage} />
      <ProtectedRoute path="/grades/:code/edit" component={GradeFormPage} />
      <ProtectedRoute path="/grades/:code" component={GradeDetailPage} />
      <ProtectedRoute path="/grades" component={GradesPage} />

      {/* Designations — DESIGNATIONMASTER */}
      <ProtectedRoute path="/designations/new" component={DesignationFormPage} />
      <ProtectedRoute path="/designations/:code/edit" component={DesignationFormPage} />
      <ProtectedRoute path="/designations" component={DesignationsPage} />

      {/* Categories — categorymaster, company-scoped */}
      <ProtectedRoute path="/categories/new" component={CategoryFormPage} />
      <ProtectedRoute path="/categories/:compid/:code/edit" component={CategoryFormPage} />
      <ProtectedRoute path="/categories/:compid/:code" component={CategoryDetailPage} />
      <ProtectedRoute path="/categories" component={CategoriesPage} />

      {/* Client Master — business Client records are stored in UNITMASTER */}
      <ProtectedRoute path="/clients/new"              component={UnitFormPage} />
      <ProtectedRoute path="/clients/:unitcode/edit"   component={UnitFormPage} />
      <ProtectedRoute path="/clients/:unitcode"        component={UnitDetailPage} />
      <ProtectedRoute path="/clients"                  component={UnitsPage} />

      {/* Legacy aliases retained for compatibility; UI uses /clients */}
      <ProtectedRoute path="/sites" component={SitesPage} />
      <ProtectedRoute path="/units/new"              component={UnitFormPage} />
      <ProtectedRoute path="/units/:unitcode/edit"   component={UnitFormPage} />
      <ProtectedRoute path="/units/:unitcode"        component={UnitDetailPage} />
      <ProtectedRoute path="/units"                  component={UnitsPage} />

      {/* Workforce — full CRUD */}
      <ProtectedRoute path="/workers/new"           component={WorkerFormPage} />
      <ProtectedRoute path="/workers/:EmpCode/edit" component={WorkerFormPage} />
      <ProtectedRoute path="/workers/:id"           component={WorkerDetailPage} />
      <ProtectedRoute path="/workers"               component={WorkersPage} />

      {/* Legacy employee URL — /workers is the single canonical module */}
      <Route path="/employees">{() => <Redirect to="/workers" />}</Route>

      {/* Admin */}
      <ProtectedRoute path="/users" component={UsersPage} />
      <ProtectedRoute path="/roles" component={RolesPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
