/**
 * Frontend dev auth bypass — symmetrical to backend devAuthBypass.ts.
 *
 * When active, reads a synthetic user from localStorage '__dev_user__' and
 * returns a minimal MSAL-compatible account + a pre-built /api/secure/ping
 * response so the React router can render protected surfaces without a real
 * MSAL session.
 *
 * THREE INDEPENDENT SAFETY GATES — all must pass or this returns null:
 *   1. import.meta.env.MODE must not be 'production' (Vite dead-code eliminates
 *      this entire code path in production bundles)
 *   2. VITE_DEV_AUTH_BYPASS must equal the literal string 'true'
 *   3. A loud console.warn banner is emitted on first activation
 */

import type { AccountInfo } from '@azure/msal-browser'

export const DEV_USER_STORAGE_KEY = '__dev_user__'

const BYPASS_BANNER = `
*** WARNING ***
FRONTEND DEV AUTH BYPASS IS ACTIVE
This build accepts a localStorage __dev_user__ key in
lieu of real MSAL authentication. This MUST NEVER ship
to production. If you see this message in a production
deployment, halt the deploy immediately.
*** WARNING ***
`.trim()

export interface DevUser {
  oid: string
  roles: string[]
  org_id: number
}

export interface DevBypassData {
  account: AccountInfo
  me: { ok: boolean; roles: string[]; user: Record<string, unknown> }
}

let _warned = false

function isValidDevUser(u: unknown): u is DevUser {
  if (!u || typeof u !== 'object') return false
  const d = u as Record<string, unknown>
  return (
    typeof d.oid === 'string' &&
    d.oid.length > 0 &&
    Array.isArray(d.roles) &&
    typeof d.org_id === 'number'
  )
}

/**
 * Returns bypass data if all three safety gates pass and a valid
 * __dev_user__ key is present in localStorage.  Returns null otherwise —
 * including all production builds.
 */
export function getDevAuthBypass(): DevBypassData | null {
  // Gate 1: hard block — production mode, dead-code-eliminated by Vite
  if (import.meta.env.MODE === 'production') return null

  // Gate 2: explicit opt-in required at build/dev time
  if (import.meta.env.VITE_DEV_AUTH_BYPASS !== 'true') return null

  // Gate 3: loud banner (once per module lifetime)
  if (!_warned) {
    console.warn('\n' + BYPASS_BANNER + '\n')
    _warned = true
  }

  const raw = localStorage.getItem(DEV_USER_STORAGE_KEY)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('[devAuthBypass] __dev_user__ is not valid JSON — falling back to MSAL')
    return null
  }

  if (!isValidDevUser(parsed)) {
    console.warn(
      '[devAuthBypass] __dev_user__ missing required fields (oid, roles[], org_id) — falling back to MSAL',
    )
    return null
  }

  const { oid, roles, org_id } = parsed

  const account: AccountInfo = {
    homeAccountId: `${oid}.dev-bypass`,
    environment: 'dev-bypass',
    tenantId: 'dev-bypass',
    username: `${oid}@dev.bypass`,
    localAccountId: oid,
    name: `Dev Bypass: ${oid}`,
    idTokenClaims: { oid, tid: 'dev-bypass', roles },
  }

  const me = {
    ok: true,
    roles,
    user: { oid, org_id, name: `Dev Bypass: ${oid}` },
  }

  return { account, me }
}
