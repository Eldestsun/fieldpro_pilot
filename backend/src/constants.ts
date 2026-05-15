/**
 * System-level actor OID used when audit_log entries are written by automated
 * scripts (cron jobs, populate scripts) rather than by a real user session.
 *
 * This is a stable synthetic identifier — not a real Azure Entra OID.
 * It must never be assigned as an app role or appear in the Entra directory.
 *
 * Can be overridden at runtime via SYSTEM_ACTOR_OID env var for environments
 * that require a different namespaced sentinel (e.g. per-service identifiers).
 */
export const SYSTEM_ACTOR_OID = 'system:baseline-automated';
