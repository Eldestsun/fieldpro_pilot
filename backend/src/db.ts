import { Pool } from "pg";

export const pool = new Pool({
  host: "localhost",     // ← CORRECT for backend running on your Mac
  port: 5432,
  user: "fieldpro",
  password: "fieldpro_pass",
  database: "fieldpro_db",
});