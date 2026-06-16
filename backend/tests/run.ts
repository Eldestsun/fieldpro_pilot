import { pool, runAll } from "./setup";

// Importing each test file registers its tests into the shared registry in setup.ts.
import "./canonical/visits.test";
import "./canonical/observations.test";
import "./canonical/evidence.test";
import "./canonical/assignments.test";
import "./canonical/auditLog.test";
import "./canonical/authClaims.test";
import "./canonical/eamBridge.test";
import "./canonical/uploadValidation.test";
import "./canonical/oidCipher.test";
import "./canonical/exportDelete.test";
import "./canonical/sftpExport.test";
import "./canonical/devAuthBypass.test";
import "./canonical/loadRouteRunById.test";
import "./canonical/roleRenamePhase1Audit.test";
import "./canonical/cleanLogsIdentity.test";
import "./canonical/cleanLogsCanonicalPivot.test";

(async () => {
  console.log("canonical integration tests — real local DB, no mocking\n");
  const code = await runAll();
  await pool.end();
  process.exit(code);
})().catch(async (err) => {
  console.error("test runner crashed:", err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
