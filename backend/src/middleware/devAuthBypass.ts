import { RequestHandler } from 'express';
import { writeAuditLog } from './auditLog';

// Null UUID used as the synthetic tenant id (tid) for bypass sessions. Clearly
// synthetic on sight. The bypass audit row is written with the persona's fixed
// NUMERIC org id (audit_log.org_id is bigint since Phase 3) — never with this
// sentinel, which writeAuditLog would refuse (fail-closed: it no longer falls
// back to the first org on an unmatched tenant string).
const DEV_BYPASS_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// ── GUARD-DEVBYPASS: the compile-time persona registry ───────────────────────
// The bypass mints identity ONLY from this fixed table. Nothing about the
// minted identity — oid, roles, org — is readable from the request; the caller
// selects a persona BY NAME and gets that persona verbatim. This is the
// structural containment the old header contract lacked: even if both env
// gates fail in a deployed environment, the worst case is this known, bounded
// set of synthetic dev identities in the dev org (plus one deliberately
// empty-org outsider) — not unauthenticated arbitrary-role, arbitrary-org
// access. In particular the caller can no longer choose org_id, which sets
// the RLS tenant scope.
//
// org_id 1 is the dev/pilot org (single-org KCM dev DB). 'outsider' exists so
// org-isolation tests can prove another org sees nothing; org 2 has no data.
// 'ul-legacy' and 'multi' exist to keep the role-rename dual-accept window and
// multi-role parsing covered by tests. If a new spec needs a new shape, add a
// persona here — never a header.
export interface DevPersona {
  oid: string;
  org_id: number;
  roles: string[];
}

export const DEV_PERSONAS: Readonly<Record<string, DevPersona>> = Object.freeze({
  specialist: { oid: 'dev-persona-specialist', org_id: 1, roles: ['Specialist'] },
  lead:       { oid: 'dev-persona-lead',       org_id: 1, roles: ['Lead'] },
  dispatch:   { oid: 'dev-persona-dispatch',   org_id: 1, roles: ['Dispatch'] },
  admin:      { oid: 'dev-persona-admin',      org_id: 1, roles: ['Admin'] },
  'ul-legacy': { oid: 'dev-persona-ul-legacy', org_id: 1, roles: ['UL'] },
  multi:      { oid: 'dev-persona-multi',      org_id: 1, roles: ['UL', 'Lead'] },
  outsider:   { oid: 'dev-persona-outsider',   org_id: 2, roles: ['Dispatch'] },
});

interface BypassEnv {
  NODE_ENV?: string;
  DEV_AUTH_BYPASS?: string;
}

const BOOT_BANNER = `
*** WARNING ***
DEV AUTH BYPASS IS ACTIVE
This server accepts an X-Dev-Persona header in lieu of
real authentication. This MUST NEVER run in production.
If you see this message in a production deploy, halt
the deploy immediately.
*** WARNING ***
`.trim();

/**
 * Factory that returns an Express middleware when the dev bypass is allowed,
 * or null when it must not activate.
 *
 * TWO environment gates — both must pass or the function returns null:
 *
 *   Gate 1: NODE_ENV must not be 'production'
 *   Gate 2: DEV_AUTH_BYPASS must equal the literal string 'true'
 *
 * (A boot banner is also printed when active. It is an alarm, not a gate —
 * it prevents nothing and is not counted as one.)
 *
 * The gates are environment-controlled and therefore NOT the containment.
 * The containment is the persona registry above: when active, the middleware
 * reads a single X-Dev-Persona header, looks it up in DEV_PERSONAS, and mints
 * that fixed identity. Unknown or missing persona → fall through to real auth
 * (requireAuth 401s). No identity field is ever derived from the request.
 * A fire-and-forget audit_log entry is written for every bypass use so there
 * is always a verifiable record of when the path was exercised.
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

  // Boot-time banner: always emitted when the bypass is active (alarm only)
  console.warn('\n' + BOOT_BANNER + '\n');

  const handler: RequestHandler = (req, _res, next) => {
    const personaRaw = req.headers['x-dev-persona'];

    // Missing header → fall through to real auth (requireAuth handles 401)
    if (!personaRaw) return next();

    const personaName = String(personaRaw).trim().toLowerCase();
    const persona = DEV_PERSONAS[personaName];

    // Unknown persona → fall through to real auth. Never mint a partial or
    // caller-shaped identity.
    if (!persona) return next();

    req.user = {
      oid:    persona.oid,
      tid:    DEV_BYPASS_TENANT_ID,
      org_id: persona.org_id,
      roles:  [...persona.roles],
    };
    req.roles = [...persona.roles];

    // Audit trail — fire-and-forget; never blocks the request
    (async () => {
      try {
        await writeAuditLog({
          actor_oid: persona.oid,
          org_id:    persona.org_id,
          action:    'auth.dev_bypass',
          // Labor safety: the OID is already in actor_oid and the org in
          // org_id — neither is copied into detail. The persona name is the
          // only request-supplied input and the only thing worth recording.
          detail: {
            'x-dev-persona': personaName,
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
