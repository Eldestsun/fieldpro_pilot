/**
 * Canonical set of audit action strings.
 * Imported by adminRoutes.ts (for runtime validation) and
 * by src/openapi/generate.ts (to cross-check spec x-audit-action values).
 * Keep this in sync with the audit_log action registry in SECURITY_SPRINT_1_CODE_GAPS.md §S1-1.
 */
export const AUDIT_KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'auth.login',
  'auth.login_failed',
  'assignment.create',
  'assignment.reassign',
  'assignment.cancel',
  'export.data_export',
  'export.delete_confirm',
  'export.delete_execute',
  'admin.config_change',
  'admin.user_role_change',
  'admin.stop_edit',
  'admin.route_edit',
  'upload.rejected',
  'admin.oid_decrypt', // S1-13: logged on every captured_by_oid decryption
]);
