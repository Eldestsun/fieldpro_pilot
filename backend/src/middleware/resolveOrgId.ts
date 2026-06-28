import { pool } from "../db";

/**
 * Thrown when an authenticated caller's org cannot be POSITIVELY resolved.
 *
 * Carries `status = 403` so a request fails CLOSED — a visible deny — instead of
 * being silently scoped to a default org. A route's catch that honours `err.status`
 * maps it to 403; even a generic 500 catch surfaces it visibly. The one outcome
 * this prevents is the old silent "scope the unmatched caller to org 1." (ISSUE-013)
 */
export class OrgResolutionError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "OrgResolutionError";
  }
}

/**
 * Resolve the numeric org_id for the authenticated request — FAIL CLOSED.
 *
 * Dev bypass (agent/test sessions): `req.user.org_id` is set directly as a numeric
 * value and used as-is (the early return below).
 *
 * Real Entra tokens: org_id is not in the JWT (`authz.ts` sets `req.user` to the raw
 * token payload). We resolve it ONLY by matching the tenant UUID (`tid` claim)
 * against `organizations.tenant_uuid`. If there is no `tid`, or no organization row
 * matches it, the tenant is not provisioned and we THROW `OrgResolutionError` (403).
 *
 * We deliberately do NOT fall back to a default / lowest-id org. The previous
 * `UNION ALL ... ORDER BY id LIMIT 1` + `?? 1` fallback silently scoped any
 * unmatched caller to org 1 — fail-OPEN cross-tenant exposure once a second org
 * exists (ISSUE-013). A single-org pilot must have `organizations.tenant_uuid`
 * populated (see migration `20260627_issue013_seed_org1_tenant_uuid.sql`) so the
 * legitimate match path resolves; the fallback is not a substitute for that data.
 *
 * NOTE: `organizations` is not an RLS table, so this bare lookup is correct without
 * org context (verified: no RLS policy on the table).
 */
export async function resolveNumericOrgId(req: any): Promise<number> {
  const user = req?.user;
  if (user?.org_id != null) return Number(user.org_id);

  const tid = user?.tid ?? null;
  if (tid == null) {
    throw new OrgResolutionError(
      "org resolution failed: request carries no tenant id (tid)",
    );
  }

  const res = await pool.query(
    `SELECT id FROM organizations WHERE tenant_uuid = $1`,
    [tid],
  );
  if (res.rows.length === 0) {
    throw new OrgResolutionError(
      `org resolution failed: no organization provisioned for tenant ${tid}`,
    );
  }
  return res.rows[0].id;
}
