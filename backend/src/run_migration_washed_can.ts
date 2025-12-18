
import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log("Running migration...");
        const sql = fs.readFileSync(path.join(__dirname, "../migrations/20251216_add_washed_can.sql"), "utf-8");
        await client.query(sql);
        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        process.exit();
    }
}

runMigration();
