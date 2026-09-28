/**
 * Bank verification endpoints.
 * Verification is server-controlled; callers cannot directly mark an account verified.
 */

import { Router, type IRouter } from "express";
import { queryOne, execute } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { assertWorkerScope } from "../lib/scope-guard.js";
import { logClientAction } from "../lib/client-audit.js";
import { verifyBankAccountPenniless } from "../lib/sandbox-penniless.js";
import { logger } from "../lib/logger.js";
import { createBankVerificationToken } from "../lib/bank-verification-token.js";

const router: IRouter = Router();
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("workers", "write")];


async function verifyUnsavedEmployeeBank(req: any, res: any): Promise<void> {
  const user = req.clientUser!;
  const body = req.body as Record<string, unknown>;

  const accountNumber = String(body.accountNumber ?? "").trim();
  const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
  const nameInBank = String(body.nameInBank ?? "").trim();
  const compid = Number(body.compid);
  const branchcode = body.branchcode != null && body.branchcode !== "" ? Number(body.branchcode) : undefined;
  const clientcode = body.clientcode != null && body.clientcode !== "" ? Number(body.clientcode) : undefined;
  const unitcode = body.unitcode != null && body.unitcode !== "" ? String(body.unitcode) : undefined;

  if (!accountNumber || !ifsc || !nameInBank) {
    res.status(400).json({ error: "Name in Bank, account number and IFSC are required" });
    return;
  }
  if (!Number.isFinite(compid)) {
    res.status(400).json({ error: "Select the employee company before bank verification" });
    return;
  }

  // Apply the same Company / Branch / Client access control used by worker creation.
  const scopeOk = await assertWorkerScope(req, res, compid, branchcode, clientcode, unitcode);
  if (!scopeOk) return;

  try {
    const result = await verifyBankAccountPenniless(accountNumber, ifsc);
    const bankVerificationToken = result.verified
      ? createBankVerificationToken({
          accountNumber,
          ifsc,
          beneficiaryName: result.nameAtBank,
          provider: result.provider,
          transactionId: result.transactionId,
        })
      : null;

    await logClientAction(user.id, "worker.bank.verify_penniless.precreate", {
      compid,
      branchcode: branchcode ?? null,
      clientcode: clientcode ?? null,
      verified: result.verified,
      provider: result.provider,
      transactionId: result.transactionId,
      // Account number, IFSC, entered name and beneficiary name intentionally omitted.
    });

    res.json({
      verified: result.verified,
      accountExists: result.accountExists,
      beneficiaryName: result.nameAtBank,
      provider: result.provider,
      transactionId: result.transactionId,
      bankVerificationToken,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Bank verification failed";
    logger.warn({ event: "worker_bank_precreate_verify_failed", err: msg }, "Pre-create penniless bank verification failed");
    res.status(422).json({ error: msg });
  }
}

async function verifySavedEmployeeBank(req: any, res: any): Promise<void> {
  const { EmpCode } = req.params;
  const user = req.clientUser!;

  const worker = await queryOne<Record<string, unknown>>(
    `SELECT "EmpCode", "compid", "branchcode", "clientcode", "unitcode", "acno", "SavingIFSCCode", "NameInBank"
       FROM "EMPMAST" WHERE "EmpCode" = $1 LIMIT 1`,
    [EmpCode],
  );
  if (!worker) { res.status(404).json({ error: "Employee not found" }); return; }

  const scopeOk = await assertWorkerScope(
    req, res,
    Number(worker.compid),
    worker.branchcode != null ? Number(worker.branchcode) : undefined,
    worker.clientcode != null ? Number(worker.clientcode) : undefined,
    worker.unitcode != null ? String(worker.unitcode) : undefined,
  );
  if (!scopeOk) return;

  const accountNumber = String(worker.acno ?? "").trim();
  const ifsc = String(worker.SavingIFSCCode ?? "").trim();
  if (!accountNumber || !ifsc) {
    res.status(400).json({ error: "Save the bank account number and IFSC before verification" });
    return;
  }

  try {
    const result = await verifyBankAccountPenniless(accountNumber, ifsc);

    await execute(
      `UPDATE "EMPMAST"
          SET "isAcctVarify" = $1,
              "VerifiedBeneficiaryName" = $2,
              "RecordUpdateByUserID" = $3,
              "RecordUpdateDate" = $4
        WHERE "EmpCode" = $5`,
      [result.verified ? 1 : 0, result.nameAtBank, user.id, new Date(), EmpCode],
    );

    await logClientAction(user.id, "worker.bank.verify_penniless", {
      empCode: EmpCode,
      compid: Number(worker.compid),
      verified: result.verified,
      provider: result.provider,
      transactionId: result.transactionId,
      // Account number, IFSC and beneficiary name intentionally omitted from audit log.
    });

    res.json({
      verified: result.verified,
      accountExists: result.accountExists,
      beneficiaryName: result.nameAtBank,
      provider: result.provider,
      transactionId: result.transactionId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Bank verification failed";
    logger.warn({ event: "worker_bank_verify_failed", empCode: EmpCode, err: msg }, "Worker penniless bank verification failed");
    res.status(422).json({ error: msg });
  }
}

router.post("/workers/bank/verify-penniless", ...canWrite, verifyUnsavedEmployeeBank);
router.post("/workers/:EmpCode/bank/verify-penniless", ...canWrite, verifySavedEmployeeBank);
router.post("/employees/:EmpCode/bank/verify-penniless", ...canWrite, verifySavedEmployeeBank);

export default router;
