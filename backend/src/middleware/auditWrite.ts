import { writeAuditLog, AuditEntry } from './auditLog';

/**
 * Fire-and-forget audit write. Never throws, never blocks the primary request.
 * All audit wiring in route handlers must go through this function.
 */
export function auditWrite(entry: AuditEntry): void {
  (async () => {
    try {
      await writeAuditLog(entry);
    } catch (err) {
      console.error('[audit] write failed — non-blocking:', err);
    }
  })();
}

/**
 * Extract org_id from the Azure Entra tid claim on the JWT payload.
 * Falls back to AZURE_TENANT_ID env var so dev/test paths always have a value.
 */
export function reqOrgId(req: any): string {
  return req?.user?.tid ?? process.env.AZURE_TENANT_ID ?? 'unknown';
}
