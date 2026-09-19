import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// ============================================================================
// ISSUE-067 — sign-out is app-scoped, never org-wide.
//
// The app's Sign out used to call instance.logoutPopup(), which ends the
// Entra SSO session at login.microsoftonline.com for that account. On a field
// device whose browser is signed in as the worker's org user, that signed the
// worker out of every Microsoft surface in the browser — verified 2026-09-13
// against the Entra session list during multi-persona setup.
//
// These tests pin the fixed contract: signOut clears the LOCAL MSAL cache for
// the signed-in account and never touches the Entra logout endpoint. A future
// revert to logoutPopup()/logoutRedirect() turns this suite red.
// ============================================================================

const { mockInstance, fakeAccount, offlineMocks } = vi.hoisted(() => {
  const fakeAccount = {
    homeAccountId: 'home-1',
    localAccountId: 'local-1',
    tenantId: 'tenant-1',
    username: 'worker@example.com',
    idTokenClaims: { oid: 'test-oid' },
  }
  const mockInstance = {
    getActiveAccount: vi.fn(() => fakeAccount),
    getAllAccounts: vi.fn(() => [fakeAccount]),
    acquireTokenSilent: vi.fn(async () => ({ accessToken: 'tok' })),
    setActiveAccount: vi.fn(),
    loginPopup: vi.fn(async () => ({ account: fakeAccount })),
    logoutPopup: vi.fn(async () => {}),
    logoutRedirect: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
  }
  const offlineMocks = {
    clearOfflineStateForUser: vi.fn(),
    clearPhotosForUser: vi.fn(async () => {}),
    clearDraftsForUser: vi.fn(async () => {}),
  }
  return { mockInstance, fakeAccount, offlineMocks }
})

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: mockInstance, accounts: [fakeAccount] }),
}))
vi.mock('../devAuthBypass', () => ({ getDevAuthBypass: () => null }))
vi.mock('../../offline/offlineQueue', () => ({
  clearOfflineStateForUser: offlineMocks.clearOfflineStateForUser,
}))
vi.mock('../../offline/photoStore', () => ({
  clearPhotosForUser: offlineMocks.clearPhotosForUser,
}))
vi.mock('../../offline/stopDraftStore', () => ({
  clearDraftsForUser: offlineMocks.clearDraftsForUser,
}))

let ctx: ReturnType<typeof useAuth>
function Probe() {
  ctx = useAuth()
  return null
}

describe('ISSUE-067 — app-scoped sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep the auto-fetch /secure/ping effect quiet during these tests.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, roles: ['Specialist'] }),
    })))
  })

  it('signOut clears the local MSAL cache for the account and deactivates it', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await ctx.signOut() })

    expect(mockInstance.clearCache).toHaveBeenCalledTimes(1)
    expect(mockInstance.clearCache).toHaveBeenCalledWith({ account: fakeAccount })
    expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(null)
  })

  it('signOut NEVER calls the Entra logout endpoint (logoutPopup/logoutRedirect)', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await ctx.signOut() })

    expect(mockInstance.logoutPopup).not.toHaveBeenCalled()
    expect(mockInstance.logoutRedirect).not.toHaveBeenCalled()
  })

  it('per-user offline cleanup still runs on sign-out (cross-user bleed guard)', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await ctx.signOut() })

    expect(offlineMocks.clearOfflineStateForUser).toHaveBeenCalledWith('tenant-1', 'test-oid')
    expect(offlineMocks.clearPhotosForUser).toHaveBeenCalledWith('tenant-1', 'test-oid')
    expect(offlineMocks.clearDraftsForUser).toHaveBeenCalledWith('tenant-1', 'test-oid')
  })
})
