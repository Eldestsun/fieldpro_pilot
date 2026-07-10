import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    pool_label: 'North Sector', stop_count: 5, completed_stops: 0, ...over,
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
