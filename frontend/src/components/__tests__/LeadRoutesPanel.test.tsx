import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LeadRoutesPanel } from '../LeadRoutesPanel'
import { getOpsRouteRuns, type OpsRouteRun } from '../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../api/routeRuns', () => ({ getOpsRouteRuns: vi.fn() }))
vi.mock('../../hooks/useCreateRoute', () => ({
  useCreateRoute: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false }),
}))
vi.mock('../RouteCreatePanel', () => ({ RouteCreatePanel: () => null }))
vi.mock('../LeadRouteDetail', () => ({ LeadRouteDetail: () => <div data-testid="detail" /> }))
vi.mock('../LeadCompletedRouteDetail', () => ({ LeadCompletedRouteDetail: () => <div data-testid="completed-detail" /> }))

const mockGet = vi.mocked(getOpsRouteRuns)

function run(over: Partial<OpsRouteRun>): OpsRouteRun {
  return {
    id: 1, route_pool_id: 'POOL-1', base_id: 'SOUTH', status: 'in_progress',
    run_date: '2026-07-09', created_at: '2026-07-09T00:00:00Z',
    pool_label: 'North Sector', stop_count: 5, completed_stops: 0,
    hazard_count: 0, skipped_count: 0, emergency_count: 0, ...over,
  }
}

describe('LeadRoutesPanel — A1 X-of-Y progress', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "completed of total" per run row in active and completed tables', async () => {
    mockGet.mockResolvedValue([
      run({ id: 11, status: 'in_progress', stop_count: 5, completed_stops: 3 }),
      run({ id: 12, status: 'planned', stop_count: 4, completed_stops: 0 }),
      run({ id: 13, status: 'completed', stop_count: 6, completed_stops: 6 }),
    ])
    render(<LeadRoutesPanel />)

    // Active rows show progress from already-returned fields.
    const active11 = await screen.findByText('#11')
    expect(within(active11.closest('tr')!).getByText('3 of 5')).toBeInTheDocument()
    const active12 = screen.getByText('#12')
    expect(within(active12.closest('tr')!).getByText('0 of 4')).toBeInTheDocument()

    // Completed row also shows X-of-Y.
    const done13 = screen.getByText('#13')
    expect(within(done13.closest('tr')!).getByText('6 of 6')).toBeInTheDocument()
  })

  it('does not render a bare total (regression: old behavior showed stop_count only)', async () => {
    mockGet.mockResolvedValue([run({ id: 21, status: 'in_progress', stop_count: 5, completed_stops: 2 })])
    render(<LeadRoutesPanel />)
    const row = (await screen.findByText('#21')).closest('tr')!
    expect(within(row).getByText('2 of 5')).toBeInTheDocument()
    expect(within(row).queryByText('5', { exact: true })).not.toBeInTheDocument()
  })
})

describe('LeadRoutesPanel — A2 exception badges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders only non-zero counts; emergency_count is displayed as "unplanned"', async () => {
    mockGet.mockResolvedValue([
      run({ id: 31, status: 'in_progress', hazard_count: 2, skipped_count: 1, emergency_count: 1 }),
    ])
    render(<LeadRoutesPanel />)
    const row = (await screen.findByText('#31')).closest('tr')!
    expect(within(row).getByText('2 hazards')).toBeInTheDocument()
    expect(within(row).getByText('1 skipped')).toBeInTheDocument()
    expect(within(row).getByText('1 unplanned')).toBeInTheDocument()
    expect(within(row).queryByText(/emergency/i)).not.toBeInTheDocument()
  })

  it('renders NO badges when all counts are zero (silence = clean; no "0 hazards")', async () => {
    mockGet.mockResolvedValue([
      run({ id: 32, status: 'in_progress', hazard_count: 0, skipped_count: 0, emergency_count: 0 }),
    ])
    render(<LeadRoutesPanel />)
    const row = (await screen.findByText('#32')).closest('tr')!
    // No "0 hazards/skipped/unplanned" badge — silence = clean.
    expect(within(row).queryByText(/hazard/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/skipped/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/unplanned/i)).not.toBeInTheDocument()
  })

  it('renders partial badges (only the non-zero ones)', async () => {
    mockGet.mockResolvedValue([
      run({ id: 33, status: 'in_progress', hazard_count: 0, skipped_count: 3, emergency_count: 0 }),
    ])
    render(<LeadRoutesPanel />)
    const row = (await screen.findByText('#33')).closest('tr')!
    expect(within(row).getByText('3 skipped')).toBeInTheDocument()
    expect(within(row).queryByText(/hazard/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/unplanned/i)).not.toBeInTheDocument()
  })
})

describe('LeadRoutesPanel — D3b ad-hoc tag', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the ad-hoc badge ONLY for is_adhoc runs, in both tables', async () => {
    mockGet.mockResolvedValue([
      run({ id: 51, status: 'in_progress', is_adhoc: true }),
      run({ id: 52, status: 'in_progress', is_adhoc: false }),
      run({ id: 53, status: 'completed', is_adhoc: true }),
      run({ id: 54, status: 'completed' }), // flag absent — legacy rows read false
    ])
    render(<LeadRoutesPanel />)

    const tagged = (await screen.findByText('#51')).closest('tr')!
    expect(within(tagged).getByText('ad-hoc')).toBeInTheDocument()

    const untagged = screen.getByText('#52').closest('tr')!
    expect(within(untagged).queryByText('ad-hoc')).not.toBeInTheDocument()

    const taggedDone = screen.getByText('#53').closest('tr')!
    expect(within(taggedDone).getByText('ad-hoc')).toBeInTheDocument()

    const legacyDone = screen.getByText('#54').closest('tr')!
    expect(within(legacyDone).queryByText('ad-hoc')).not.toBeInTheDocument()
  })
})

describe('LeadRoutesPanel — A3 30s polling', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('fetches on mount, refetches every 30s, and stops after unmount (mirrors CC)', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValue([run({ id: 41, status: 'in_progress' })])
    const { unmount } = render(<LeadRoutesPanel />)

    // Flush the mount effect + its async chain, then assert the initial fetch fired.
    await vi.advanceTimersByTimeAsync(0)
    expect(mockGet).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(mockGet).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(mockGet).toHaveBeenCalledTimes(3)

    // Unmount clears the interval — no further polling.
    unmount()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(mockGet).toHaveBeenCalledTimes(3)
  })
})
