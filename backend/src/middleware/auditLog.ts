import { pool } from '../db';

export interface AuditEntry {
  actor_oid: string;
  // Accepts number (preferred) or string for backward compat with callers that pass a tenant UUID.
  // writeAuditLog resolves string UUIDs to the numeric organizations.id before inserting.
  org_id: number | string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  let numericOrgId: number;
  if (typeof entry.org_id === 'number') {
    numericOrgId = entry.org_id;
  } else if (/^\d+$/.test(String(entry.org_id))) {
    numericOrgId = parseInt(String(entry.org_id), 10);
  } else {
    // UUID or sentinel string — look up by tenant_uuid, fallback to first org for single-tenant pilot.
    const res = await pool.query(
      `SELECT id FROM organizations WHERE tenant_uuid = $1
       UNION ALL SELECT id FROM organizations ORDER BY id LIMIT 1`,
      [entry.org_id],
    );
    numericOrgId = res.rows[0]?.id ?? 1;
  }

  await pool.query(
    `INSERT INTO audit_log (actor_oid, org_id, action, resource_type, resource_id, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actor_oid,
      numericOrgId,
      entry.action,
      entry.resource_type ?? null,
      entry.resource_id ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      entry.ip_address ?? null,
    ]
  );
}
