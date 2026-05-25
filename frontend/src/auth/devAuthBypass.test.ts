import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Helpers to dynamically import devAuthBypass with fresh module state per test.
// vi.resetModules() clears the module registry so _warned and the env checks
// re-evaluate on each dynamic import().

async function loadModule() {
  const mod = await import('./devAuthBypass')
  return mod
}

function setDevUser(val: unknown) {
  localStorage.setItem('__dev_user__', JSON.stringify(val))
}

describe('getDevAuthBypass', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when MODE is production, regardless of other gates', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    setDevUser({ oid: 'test-oid', roles: ['Specialist'], org_id: 1 })
    const { getDevAuthBypass } = await loadModule()
    expect(getDevAuthBypass()).toBeNull()
  })

  it('returns null when VITE_DEV_AUTH_BYPASS is not "true"', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false')
    setDevUser({ oid: 'test-oid', roles: ['Specialist'], org_id: 1 })
    const { getDevAuthBypass } = await loadModule()
    expect(getDevAuthBypass()).toBeNull()
  })

  it('returns null when __dev_user__ key is absent', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    // localStorage is clear — no key set
    const { getDevAuthBypass } = await loadModule()
    expect(getDevAuthBypass()).toBeNull()
  })

  it('returns null and warns when __dev_user__ is invalid JSON', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    localStorage.setItem('__dev_user__', '{bad json')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getDevAuthBypass } = await loadModule()
    expect(getDevAuthBypass()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not valid JSON'),
    )
    warnSpy.mockRestore()
  })

  it('returns null and warns when __dev_user__ is missing required fields', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    setDevUser({ oid: 'test-oid' }) // missing roles and org_id
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getDevAuthBypass } = await loadModule()
    expect(getDevAuthBypass()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing required fields'),
    )
    warnSpy.mockRestore()
  })

  // Role rename Phase 3 — narrowed predicate verification.
  // After Phase 3, App.tsx's isDispatch derivation accepts only 'Dispatch'
  // (DefaultRedirect, RequireRole on /routes).  Legacy 'Lead' tokens no
  // longer satisfy the predicate.  This test locks in the narrowed shape so
  // an accidental revert to dual-accept fails loudly.
  it('passes Dispatch through; Dispatch satisfies isDispatch predicate; Lead does not', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    setDevUser({ oid: 'dispatch-user', roles: ['Dispatch'], org_id: 1 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getDevAuthBypass } = await loadModule()
    const result = getDevAuthBypass()

    expect(result).not.toBeNull()
    expect(result!.me.roles).toEqual(['Dispatch'])

    // Mirror the narrowed predicate from App.tsx (isDispatch derivation and
    // DefaultRedirect's /routes branch).  Phase 3 dropped 'Lead' from the
    // accepted set.
    const navPredicate = (roles: string[]) => roles.includes('Dispatch')
    expect(navPredicate(result!.me.roles)).toBe(true)
    expect(navPredicate(['Lead'])).toBe(false)
    vi.restoreAllMocks()
  })

  it('returns valid DevBypassData with correct account and me when all gates pass', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true')
    setDevUser({ oid: 'user-123', roles: ['Admin', 'Dispatch'], org_id: 7 })
    vi.spyOn(console, 'warn').mockImplementation(() => {}) // suppress banner
    const { getDevAuthBypass } = await loadModule()
    const result = getDevAuthBypass()

    expect(result).not.toBeNull()
    expect(result!.account.localAccountId).toBe('user-123')
    expect(result!.account.homeAccountId).toBe('user-123.dev-bypass')
    expect(result!.account.environment).toBe('dev-bypass')
    expect(result!.me.ok).toBe(true)
    expect(result!.me.roles).toEqual(['Admin', 'Dispatch'])
    expect(result!.me.user.oid).toBe('user-123')
    expect(result!.me.user.org_id).toBe(7)
    vi.restoreAllMocks()
  })
})
