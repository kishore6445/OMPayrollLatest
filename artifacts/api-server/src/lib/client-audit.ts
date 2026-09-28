/**
 * client-audit.ts
 *
 * Write to app_activity_log in the payrollom_client database.
 */

import { execute } from "@workspace/pg-client-db";
import { logger } from "./logger.js";

export async function logClientAction(
  userId: number,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await execute(
      `INSERT INTO app_activity_log (user_id, action, details, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [userId, action, JSON.stringify(details)]
    );
  } catch (err) {
    // Audit failure must never break the main request
    logger.error({ err, userId, action }, "Failed to write client audit log");
  }
}
