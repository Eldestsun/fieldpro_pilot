import { pool } from '../db';

export interface AuditEntry {
  actor_oid: string;
  org_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor_oid, org_id, action, resource_type, resource_id, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actor_oid,
      entry.org_id,
      entry.action,
      entry.resource_type ?? null,
      entry.resource_id ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      entry.ip_address ?? null,
    ]
  );
}
