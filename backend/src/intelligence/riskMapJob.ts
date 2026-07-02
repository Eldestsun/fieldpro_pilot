
import { pool } from "../db";
import { rebuildStopRiskSnapshot } from "./riskMapService";

/**
 * Manual/Cron CLI runner for Risk Map Reconstruction.
 * Usage: RISK_MAP_ORG_ID=1 node dist/intelligence/riskMapJob.js
 *
 * RISK_MAP_ORG_ID is REQUIRED (fail-closed, ISSUE-013 pattern): the job never
 * assumes an org. Without it the rebuild would run context-less against
 * fail-closed RLS and silently produce an empty snapshot (PATTERN-001).
 */
async function main() {
    try {
        const orgId = process.env.RISK_MAP_ORG_ID;
        if (!orgId) {
            console.error("RISK_MAP_ORG_ID is required — the risk-map job never assumes a default org (fail-closed).");
            process.exit(1);
        }
        console.log("Starting Risk Map Rebuild Job...");
        const start = Date.now();

        const count = await rebuildStopRiskSnapshot(pool, orgId);

        const duration = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`Success! Processed ${count} stops in ${duration}s.`);
        process.exit(0);
    } catch (err) {
        console.error("Risk Map Job Failed:", err);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
