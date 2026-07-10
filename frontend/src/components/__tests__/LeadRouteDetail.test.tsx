import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadRouteDetail } from '../LeadRouteDetail'
import { getLeadRouteRunById, fetchUlUsers, reassignRouteRun, getStopHistory, type RouteRun, type UlUser } from '../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../api/routeRuns', () => ({
  getLeadRouteRunById: vi.fn(),
  fetchUlUsers: vi.fn(),
  reassignRouteRun: vi.fn(),
  getStopHistory: vi.fn(),
}))

const mockGetDetail = vi.mocked(getLeadRouteRunById)
const mockUsers = vi.mocked(fetchUlUsers)
const mockReassign = vi.mocked(reassignRouteRun)
const mockHistory = vi.mocked(getStopHistory)

const detail = (over: Partial<RouteRun> = {}): RouteRun => ({
  id: 42, route_pool_id: 'POOL-1', base_id: 'SOUTH', run_date: '2026-07-09',
  total_distance_m: 0, total_duration_s: 0, status: 'in_progress', stops: [],
  assigned_user: { display_name: 'Alice Assignee', role: 'Specialist' },
  created_by: { display_name: 'Dan Dispatch' }, ...over,
})

const users: UlUser[] = [
  { id: 'oid-bob-1111', displayName: 'Bob Worker', role: 'Specialist' },
  { id: 'oid-cara-2222', displayName: 'Cara Worker', role: 'Specialist' },
]

describe('LeadRouteDetail — A4 reassign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
    mockUsers.mockResolvedValue(users)
    mockReassign.mockResolvedValue()
  })

  it('shows the current assignee by name, never an OID', async () => {
    mockGetDetail.mockResolvedValue(detail())
    render(<LeadRouteDetail id={42} onBack={() => {}} />)
    expect(await screen.findByText('Alice Assignee')).toBeInTheDocument()
    // No OID appears anywhere in the rendered detail.
    expect(screen.queryByText(/oid-/)).not.toBeInTheDocument()
  })

  it('reassigns: PATCH payload carries the OID, refetches on success', async () => {
    mockGetDetail.mockResolvedValue(detail())
    render(<LeadRouteDetail id={42} onBack={() => {}} />)
    await screen.findByText('Alice Assignee')
    expect(mockGetDetail).toHaveBeenCalledTimes(1)

    await userEvent.selectOptions(screen.getByLabelText('Reassign to worker'), 'oid-bob-1111')
    await userEvent.click(screen.getByRole('button', { name: /Reassign/i }))

    // Write of assignment intent: the OID is the payload value (never displayed).
    await waitFor(() => expect(mockReassign).toHaveBeenCalledWith('test-token', 42, 'oid-bob-1111'))
    // Refetch on 200.
    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(2))
  })

  it('dropdown option labels are names, not OIDs', async () => {
    mockGetDetail.mockResolvedValue(detail())
    render(<LeadRouteDetail id={42} onBack={() => {}} />)
    await screen.findByText('Alice Assignee')
    const select = screen.getByLabelText('Reassign to worker')
    // The option's visible label is the worker name; the OID lives only in the value.
    expect(screen.getByRole('option', { name: /Bob Worker/ })).toHaveValue('oid-bob-1111')
    expect(within(select).queryByText('oid-bob-1111')).not.toBeInTheDocument()
  })

  it('D5b: stop row History control opens the read-only history drawer', async () => {
    mockGetDetail.mockResolvedValue(detail({
      stops: [{
        route_run_stop_id: 7, stop_id: '31150', stopNumber: '31150', sequence: 1,
        on_street_name: 'Main St', cross_street: '1st Ave', status: 'done',
      } as any],
    }))
    mockHistory.mockResolvedValue({ stop_id: '31150', total_visits: 0, limit: 20, offset: 0, entries: [] })
    render(<LeadRouteDetail id={42} onBack={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'History for stop 31150' }))
    // Empty history renders absence, never an assumed state.
    expect(await screen.findByText('No observations recorded for this stop.')).toBeInTheDocument()
    expect(mockHistory).toHaveBeenCalledWith('test-token', '31150')
  })

  it('surfaces a reassign error on failure', async () => {
    mockGetDetail.mockResolvedValue(detail())
    mockReassign.mockRejectedValueOnce(new Error('assigned_user_oid cannot be empty string'))
    render(<LeadRouteDetail id={42} onBack={() => {}} />)
    await screen.findByText('Alice Assignee')
    await userEvent.selectOptions(screen.getByLabelText('Reassign to worker'), 'oid-cara-2222')
    await userEvent.click(screen.getByRole('button', { name: /Reassign/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be empty string/)
  })
})
