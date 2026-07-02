import { pool, withOrgContext } from '../db';

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
    // Tenant UUID (or sentinel) string — resolve ONLY by a tenant_uuid match.
    // FAIL CLOSED (ISSUE-013 pattern): the old `UNION ALL … ORDER BY id LIMIT 1`
    // + `?? 1` fallback silently wrote unmatched callers' audit rows into the
    // lowest-id org's compliance trail — the same fail-open twin the audit
    // flagged. An unresolvable value now throws; auditWrite's fire-and-forget
    // catch logs it, and direct callers surface it. No default org, ever.
    const res = await pool.query(
      `SELECT id FROM organizations WHERE tenant_uuid = $1`,
      [entry.org_id],
    );
    if (res.rows.length === 0) {
      throw new Error(
        `writeAuditLog: no organization for tenant '${entry.org_id}' — audit row refused (fail-closed, never defaults to org 1)`,
      );
    }
    numericOrgId = res.rows[0].id;
  }

  // MT-2: audit_log is FORCE-RLS with a fail-closed WITH CHECK — the INSERT must
  // run with org context set, or the policy rejects the row (every audit write would
  // fail). Scope to the row's own numericOrgId.
  await withOrgContext(numericOrgId, (client) =>
    client.query(
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
    )
  );
}
