import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runStartupCheck } from "./lib/startup-check.js";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Verify payrollom_client is reachable and schema is intact before serving traffic.
// Exits with code 1 if the database is unreachable or required tables are missing.
const schemaReport = await runStartupCheck();

// Attach to the app so /api/healthz can serve live status without re-querying.
(app as any).__schemaReport = schemaReport;

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
