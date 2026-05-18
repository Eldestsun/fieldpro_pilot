import { pool } from "../db";

/**
 * Resolve the numeric org_id for the authenticated request.
 *
 * Dev bypass (agent/test sessions): req.user.org_id is set directly as a
 * numeric value and is used as-is.
 *
 * Real Entra tokens: org_id is not in the JWT. We look it up by matching
 * the tenant UUID (tid claim) against organizations.tenant_uuid. Falls back
 * to the first organization by id for single-tenant pilot deployments where
 * tenant_uuid is not yet populated.
 */
export async function resolveNumericOrgId(req: any): Promise<number> {
  const user = req?.user;
  if (user?.org_id != null) return Number(user.org_id);
  const res = await pool.query(
    `SELECT id FROM organizations WHERE tenant_uuid = $1
     UNION ALL
     SELECT id FROM organizations ORDER BY id LIMIT 1`,
    [user?.tid ?? null],
  );
  return res.rows[0]?.id ?? 1;
}
