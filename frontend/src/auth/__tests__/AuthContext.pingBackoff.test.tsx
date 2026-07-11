import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// ============================================================================
// PING-RETRY — /api/secure/ping backoff regression + demo harness.
//
// Pre-fix mechanism (Phase 0): on ping failure, setMe(null) + the isLoading
// true→false toggle restore the auto-fetch effect's precondition
// (isSignedIn && !me && !isLoading), so it re-fired on the very next render —
// zero delay, zero cap, ~1000x/sec against an unreachable backend.
//
// RED against the pre-fix AuthContext:
//   - "tight loop" test: with the clock frozen (fake timers, ZERO time
//     advanced), the pre-fix loop racks up attempt after attempt on microtasks
//     alone; the fix schedules attempt 2 on a timer, so the count stays 1.
//   - backoff tests: pre-fix there are no timers to fire, all attempts happen
//     at t=0 and the spacing assertions fail.
//
// Determinism: Math.random is pinned (1 → delay = ceiling exactly; 0.5 →
// delay = half the ceiling, proving multiplicative full jitter). Timestamps
// come from the faked Date driven by vi.advanceTimersByTimeAsync.
// ============================================================================

const { mockInstance, fakeAccount } = vi.hoisted(() => {
  const fakeAccount = {
    homeAccountId: 'home-1',
    localAccountId: 'local-1',
    tenantId: 'tenant-1',
    username: 'worker@example.com',
    idTokenClaims: { oid: 'test-oid' },
  }
  const mockInstance = {
    getActiveAccount: () => fakeAccount,
    getAllAccounts: () => [fakeAccount],
    acquireTokenSilent: async () => ({ accessToken: 'tok' }),
    setActiveAccount: () => {},
    loginPopup: async () => ({ account: fakeAccount }),
    logoutPopup: async () => {},
  }
  return { mockInstance, fakeAccount }
})

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: mockInstance, accounts: [fakeAccount] }),
}))
vi.mock('../devAuthBypass', () => ({ getDevAuthBypass: () => null }))
vi.mock('../../offline/offlineQueue', () => ({ clearOfflineStateForUser: vi.fn() }))
vi.mock('../../offline/photoStore', () => ({ clearPhotosForUser: vi.fn() }))
vi.mock('../../offline/stopDraftStore', () => ({ clearDraftsForUser: vi.fn() }))

// Probe exposes the live context to assertions.
let ctx: ReturnType<typeof useAuth>
function Probe() {
  ctx = useAuth()
  return <span data-testid="recon">{String(ctx.isReconnecting)}</span>
}

// Ping attempt log: fake-clock timestamp of every fetch("/api/secure/ping").
let attemptTimes: number[] = []
let fetchBehavior: 'fail' | 'succeed' = 'fail'
const TIGHT_LOOP_FUSE = 50 // bounds a pre-fix runaway loop so the test can't hang

function makeFetchMock() {
  return vi.fn(async () => {
    attemptTimes.push(Date.now())
    if (attemptTimes.length > TIGHT_LOOP_FUSE) {
      // Pre-fix safety fuse: park the runaway loop on a never-resolving promise.
      return new Promise(() => {})
    }
    if (fetchBehavior === 'fail') {
      throw new TypeError('Failed to fetch (simulated: backend unreachable)')
    }
    return {
      ok: true,
      json: async () => ({ ok: true, roles: ['Specialist'] }),
    }
  })
}

// Flush a few microtask generations (token → fetch → catch → finally chain)
// without advancing the clock.
async function flush(rounds = 6) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await Promise.resolve()
  })
}

async function advance(ms: number) {
  // Two separate acts on purpose: firing the timer (sync) and settling the
  // fetch chain (microtasks) in ONE act coalesces the isLoading true→false
  // round-trip into a single no-net-change commit, so the scheduling effect
  // never re-runs — a test-harness artifact the browser doesn't have (each
  // continuation is its own render there).
  act(() => {
    vi.advanceTimersByTime(ms)
  })
  await flush()
}

describe('AuthContext ping backoff (PING-RETRY)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    attemptTimes = []
    fetchBehavior = 'fail'
    vi.stubGlobal('fetch', makeFetchMock())
    vi.spyOn(Math, 'random').mockReturnValue(1) // delay = ceiling exactly
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does NOT tight-loop: with zero time advanced there is exactly one attempt', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    // Generous microtask flushing, clock frozen: the pre-fix loop re-fires on
    // microtasks alone and racks up many attempts here; the fix waits on a timer.
    for (let i = 0; i < 20; i++) await flush()
    expect(attemptTimes.length).toBe(1)
    expect(screen.getByTestId('recon').textContent).toBe('true')
  })

  it('spaces consecutive failures 1s→2s→4s→8s→16s→30s→30s (ceilings, random=1) and never gives up', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await flush() // attempt 1 at t=0, fails
    expect(attemptTimes.length).toBe(1)

    const expectedDeltas = [1000, 2000, 4000, 8000, 16000, 30000, 30000]
    for (const delta of expectedDeltas) {
      const before = attemptTimes.length
      await advance(delta - 1)
      expect(attemptTimes.length).toBe(before) // not a millisecond early
      await advance(1)
      expect(attemptTimes.length).toBe(before + 1)
    }

    const deltas = attemptTimes.slice(1).map((t, i) => t - attemptTimes[i])
    console.log('[PING-RETRY demo] attempt timestamps (ms):', attemptTimes)
    console.log('[PING-RETRY demo] deltas (ms):', deltas)
    expect(deltas).toEqual(expectedDeltas)
    // still reconnecting, still scheduled — no permanent give-up
    expect(screen.getByTestId('recon').textContent).toBe('true')
  })

  it('applies FULL jitter: delay is a uniform fraction of the ceiling (random=0.5 → half)', async () => {
    ;(Math.random as ReturnType<typeof vi.fn>).mockReturnValue(0.5)
    render(<AuthProvider><Probe /></AuthProvider>)
    await flush() // attempt 1 at t=0

    await advance(499)
    expect(attemptTimes.length).toBe(1)
    await advance(1) // 0.5 * 1000ms ceiling
    expect(attemptTimes.length).toBe(2)

    await advance(999)
    expect(attemptTimes.length).toBe(2)
    await advance(1) // 0.5 * 2000ms ceiling
    expect(attemptTimes.length).toBe(3)

    const deltas = attemptTimes.slice(1).map((t, i) => t - attemptTimes[i])
    console.log('[PING-RETRY demo] jittered deltas at random=0.5 (ms):', deltas)
    expect(deltas).toEqual([500, 1000])
  })

  it('resets to the floor on success: next failure retries at ~1s, not the previous ceiling', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await flush() // attempt 1, fail (n=1)
    await advance(1000) // attempt 2, fail (n=2)
    await advance(2000) // attempt 3, fail (n=3)
    await advance(4000) // attempt 4, fail (n=4 → next ceiling would be 8s)
    expect(attemptTimes.length).toBe(4)
    expect(screen.getByTestId('recon').textContent).toBe('true')

    // Backend comes back: the pending 8s retry succeeds.
    fetchBehavior = 'succeed'
    await advance(8000) // attempt 5 → success
    expect(attemptTimes.length).toBe(5)
    expect(ctx.me).toEqual({ ok: true, roles: ['Specialist'] })
    expect(screen.getByTestId('recon').textContent).toBe('false')

    // Backend drops again mid-session: refreshMe fails once...
    fetchBehavior = 'fail'
    await act(async () => { await ctx.refreshMe() })
    await flush()
    expect(attemptTimes.length).toBe(6)

    // ...and the retry cadence is back at the 1s floor, NOT the pre-success 8s+.
    const before = attemptTimes.length
    await advance(1000)
    expect(attemptTimes.length).toBe(before + 1)
    const resetDelta = attemptTimes[attemptTimes.length - 1] - attemptTimes[before - 1]
    console.log('[PING-RETRY demo] post-success-reset retry delta (ms):', resetDelta)
    expect(resetDelta).toBe(1000)
  })
})
