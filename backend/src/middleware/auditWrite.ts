import { writeAuditLog, AuditEntry } from './auditLog';
import { resolveNumericOrgId } from './resolveOrgId';

/**
 * Fire-and-forget audit write. Never throws, never blocks the primary request.
 * org_id accepts number, Promise<number>, or string (backward compat — resolved internally).
 */
export function auditWrite(entry: Omit<AuditEntry, 'org_id'> & { org_id: number | Promise<number> | string }): void {
  (async () => {
    try {
      const orgId = await Promise.resolve(entry.org_id);
      await writeAuditLog({ ...entry, org_id: orgId });
    } catch (err) {
      console.error('[audit] write failed — non-blocking:', err);
    }
  })();
}

/**
 * Resolve the numeric organizations.id for the authenticated request.
 * For Entra tokens: looks up by tenant UUID (tid claim) against organizations.tenant_uuid.
 * For dev bypass: uses req.user.org_id directly.
 */
export function reqOrgId(req: any): Promise<number> {
  return resolveNumericOrgId(req);
}

/**
 * Extract the raw Azure Entra tenant UUID (tid) from the JWT.
 * Used by export_delete_tokens and other systems that reference the tenant UUID directly.
 */
export function reqTenantUuid(req: any): string {
  return req?.user?.tid ?? process.env.AZURE_TENANT_ID ?? 'unknown';
}
