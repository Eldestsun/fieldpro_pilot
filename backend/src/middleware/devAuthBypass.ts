import { RequestHandler } from 'express';
import { writeAuditLog } from './auditLog';

// Null UUID used as the synthetic tenant id (tid) for bypass sessions. Clearly
// synthetic on sight. The bypass audit row is written with the NUMERIC org id
// from the x-dev-user-org-id header (audit_log.org_id is bigint since Phase 3)
// — never with this sentinel, which writeAuditLog would refuse (fail-closed:
// it no longer falls back to the first org on an unmatched tenant string).
const DEV_BYPASS_TENANT_ID = '00000000-0000-0000-0000-000000000000';

interface BypassEnv {
  NODE_ENV?: string;
  DEV_AUTH_BYPASS?: string;
}

const BOOT_BANNER = `
*** WARNING ***
DEV AUTH BYPASS IS ACTIVE
This server accepts X-Dev-User-Oid headers in lieu of
real authentication. This MUST NEVER run in production.
If you see this message in a production deploy, halt
the deploy immediately.
*** WARNING ***
`.trim();

/**
 * Factory that returns an Express middleware when the dev bypass is allowed,
 * or null when it must not activate.
 *
 * Three independent safety gates — ALL must pass or the function returns null:
 *
 *   Gate 1: NODE_ENV must not be 'production'
 *   Gate 2: DEV_AUTH_BYPASS must equal the literal string 'true'
 *   Gate 3: A loud multi-line banner is printed to stderr at boot
 *
 * When active, the middleware reads three request headers and populates
 * req.user + req.roles directly, bypassing JWKS validation entirely.
 * A fire-and-forget audit_log entry is written for every bypass use so
 * there is always a verifiable record of when the path was exercised.
 *
 * The env parameter exists only for unit-test injection; production callers
 * always rely on the default (process.env).
 */
export function createDevAuthBypass(
  env: BypassEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS,
  }
): RequestHandler | null {
  // Gate 1 — hard block: never activate in production
  if (env.NODE_ENV === 'production') return null;

  // Gate 2 — explicit opt-in: must be the literal string 'true'
  if (env.DEV_AUTH_BYPASS !== 'true') return null;

  // Gate 3 — boot-time banner: always emitted when the bypass is active
  console.warn('\n' + BOOT_BANNER + '\n');

  const handler: RequestHandler = (req, _res, next) => {
    const oid        = req.headers['x-dev-user-oid'];
    const rolesRaw   = req.headers['x-dev-user-roles'];
    const orgIdRaw   = req.headers['x-dev-user-org-id'];

    // Missing any header → fall through to real auth (requireAuth handles 401)
    if (!oid || !rolesRaw || !orgIdRaw) {
      return next();
    }

    const roles = String(rolesRaw)
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    req.user = {
      oid:    String(oid),
      tid:    DEV_BYPASS_TENANT_ID,
      org_id: parseInt(String(orgIdRaw), 10),
      roles,
    };
    req.roles = roles;

    // Audit trail — fire-and-forget; never blocks the request
    (async () => {
      try {
        await writeAuditLog({
          actor_oid: String(oid),
          org_id:    parseInt(String(orgIdRaw), 10),
          action:    'auth.dev_bypass',
          detail: {
            'x-dev-user-oid':    String(oid),
            'x-dev-user-roles':  String(rolesRaw),
            'x-dev-user-org-id': String(orgIdRaw),
          },
          ip_address: req.ip,
        });
      } catch (err) {
        console.warn('[devAuthBypass] audit write failed:', err);
      }
    })();

    next();
  };

  return handler;
}
