import { Pool } from "pg";

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host:     process.env.PGHOST     ?? "localhost",
      port:     Number(process.env.PGPORT ?? 5432),
      user:     process.env.PGUSER     ?? "fieldpro",
      password: process.env.PGPASSWORD ?? "fieldpro_pass",
      database: process.env.PGDATABASE ?? "fieldpro_db",
    });