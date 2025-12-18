
import { pool } from "../db";
import { rebuildStopRiskSnapshot } from "./riskMapService";

/**
 * Manual/Cron CLI runner for Risk Map Reconstruction.
 * Usage: node dist/intelligence/riskMapJob.js
 */
async function main() {
    try {
        console.log("Starting Risk Map Rebuild Job...");
        const start = Date.now();

        const count = await rebuildStopRiskSnapshot(pool);

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
