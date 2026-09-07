import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminSystemHealthPanel } from '../AdminSystemHealthPanel'
import { getSystemHealth, type SystemHealth } from '../../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../../api/routeRuns', () => ({ getSystemHealth: vi.fn() }))

const mockHealth = vi.mocked(getSystemHealth)

const sample: SystemHealth = {
  as_of: '2026-09-06T12:00:00Z',
  users: { by_role: { Specialist: 12, Dispatch: 3, Admin: 2 }, active_last_30d: 14 },
  stops: { active: 1240, retired: 35, total: 1275 },
  pools: { active: 8, inactive: 1, total: 9 },
  route_runs_yesterday: { planned: 7, finished: 6 },
  visits_yesterday: 142,
  eam_bridge: { last_log_at: '2026-09-05T02:03:11Z', logs_7d: 4 },
  audit_log: { rows_24h: 312, rows_7d: 2104 },
  recent_issues: { not_ok_presence_7d: 5 },
}

describe('AdminSystemHealthPanel — T2-A7', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
  })

  it('fetches on mount and renders every section', async () => {
    mockHealth.mockResolvedValue(sample)
    render(<AdminSystemHealthPanel />)

    expect(await screen.findByText('Users')).toBeInTheDocument()
    for (const section of [
      'Stops', 'Route Pools', 'Route Runs (yesterday)', 'Visits (yesterday)',
      'EAM Bridge', 'Audit Log', 'Reported Issues',
    ]) {
      expect(screen.getByText(section)).toBeInTheDocument()
    }
    // Counts render (role buckets and stop counts).
    expect(screen.getByText('Specialist')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('1240')).toBeInTheDocument()
    expect(screen.getByText('2104')).toBeInTheDocument()
  })

  it('Refresh button triggers a refetch (no auto-poll)', async () => {
    mockHealth.mockResolvedValue(sample)
    render(<AdminSystemHealthPanel />)
    await screen.findByText('Users')
    expect(mockHealth).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(mockHealth).toHaveBeenCalledTimes(2))
  })

  it('shows an error state with retry on failure', async () => {
    mockHealth.mockRejectedValueOnce(new Error('boom (500)'))
    mockHealth.mockResolvedValue(sample)
    render(<AdminSystemHealthPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom (500)')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Users')).toBeInTheDocument()
  })

  it('renders the empty route-runs state when yesterday had no runs', async () => {
    mockHealth.mockResolvedValue({ ...sample, route_runs_yesterday: {} })
    render(<AdminSystemHealthPanel />)
    await screen.findByText('Route Runs (yesterday)')
    expect(screen.getByText('No runs')).toBeInTheDocument()
  })
})
