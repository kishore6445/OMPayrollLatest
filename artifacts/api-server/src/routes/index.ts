/**
 * routes/index.ts — API router
 *
 * All routes query payrollom_client via @workspace/pg-client-db (raw pg).
 * The old SaaS Drizzle schema (@workspace/db) is not used by any active route.
 *
 * Active modules:
 *   health       — /api/healthz
 *   client-auth  — /api/auth/*
 *   company      — /api/company (COMPANYMAST) — list, detail, create, update
 *   branches     — /api/branches, /api/zones
 *   clients      — /api/clients, /api/sites (CLIENTMASTER / UNITMASTER)
 *   units        — /api/units (UNITMASTER detail)
 *   departments  — /api/departments (DEPTMAST) — list, detail, create, update
 *   grades       — /api/grades (GRADEMASTER) — list, detail, create, update
 *   categories   — /api/categories (categorymaster) — company-scoped list/detail/create/update
 *   masters      — /api/masters/* (DESIGNATIONMASTER, DEPTMAST, GRADEMASTER, categorymaster)
 *   workers      — /api/workers (EMPMAST)
 *   users        — /api/users, /api/roles, /api/permissions (app_users/app_roles/app_permissions)
 */

import { Router, type IRouter } from "express";
import healthRouter    from "./health.js";
import clientAuthRouter from "./client-auth.js";
import companyRouter   from "./company.js";
import branchesRouter  from "./branches.js";
import zonesRouter     from "./zones.js";
import clientsRouter   from "./clients.js";
import unitsRouter     from "./units.js";
import departmentsRouter from "./departments.js";
import gradesRouter      from "./grades.js";
import categoriesRouter  from "./categories.js";
import designationsRouter from "./designations.js";
import mastersRouter     from "./masters.js";
import workersRouter       from "./workers.js";
import usersRouter         from "./users.js";
import branchClientsRouter from "./branch-clients.js";
import scopeRouter         from "./scope.js";
import aadhaarRouter       from "./aadhaar.js";
import bankVerificationRouter from "./bank-verification.js";
import statutoryVerificationRouter from "./statutory-verification.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientAuthRouter);
router.use(companyRouter);
router.use(branchesRouter);
router.use(zonesRouter);
router.use(clientsRouter);
router.use(unitsRouter);
router.use(departmentsRouter);
router.use(gradesRouter);
router.use(categoriesRouter);
router.use(designationsRouter);
router.use(mastersRouter);
router.use(workersRouter);
router.use(usersRouter);
router.use(branchClientsRouter);
router.use(scopeRouter);
router.use(aadhaarRouter);
router.use(bankVerificationRouter);
router.use(statutoryVerificationRouter);

export default router;
