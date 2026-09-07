import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStopsPanel } from '../AdminStopsPanel'
import { getStopsScoped, updateAdminStop, fetchPools } from '../../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../../api/routeRuns', () => ({
  getStopsScoped: vi.fn(),
  updateAdminStop: vi.fn(),
  bulkUpdateAdminStops: vi.fn(),
  fetchPools: vi.fn(),
  getStopHistory: vi.fn(),
}))

const mockList = vi.mocked(getStopsScoped)
const mockUpdate = vi.mocked(updateAdminStop)
const mockPools = vi.mocked(fetchPools)

const activeStop = {
  stop_id: '108', bearing_code: 'E', on_street_name: 'E Madison St',
  intersection_loc: 'Far side', is_hotspot: false, compactor: false,
  has_trash: false, active: true, notes: null, pool_id: null,
}
const retiredStop = { ...activeStop, stop_id: '111', active: false }

function respondWith(items: any[]) {
  mockList.mockResolvedValue({ items, total: items.length } as any)
}

describe('AdminStopsPanel — T2-A2 retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
    mockPools.mockResolvedValue([])
    mockUpdate.mockResolvedValue({} as any)
  })

  it('fetches with include_retired=false by default', async () => {
    respondWith([activeStop])
    render(<AdminStopsPanel />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(mockList).toHaveBeenLastCalledWith(
      'test-token',
      expect.objectContaining({ include_retired: false }),
      'admin',
    )
  })

  it('"Show retired" refetches with include_retired=true', async () => {
    respondWith([activeStop, retiredStop])
    render(<AdminStopsPanel />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())

    await userEvent.click(screen.getByLabelText(/Show retired/i))

    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        'test-token',
        expect.objectContaining({ include_retired: true }),
        'admin',
      ),
    )
  })

  it('Retire opens the confirm dialog; confirming PATCHes active:false', async () => {
    respondWith([activeStop])
    render(<AdminStopsPanel />)
    await screen.findByRole('button', { name: 'Retire stop 108' })

    await userEvent.click(screen.getByRole('button', { name: 'Retire stop 108' }))
    // Nothing sent yet — dialog is the gate.
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Retire stop 108\?/)
    expect(screen.getByRole('dialog')).toHaveTextContent(/no longer appear in route planning/)

    await userEvent.click(screen.getByRole('button', { name: 'Retire' }))
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('test-token', '108', { active: false }),
    )
  })

  it('cancelling the confirm dialog sends nothing', async () => {
    respondWith([activeStop])
    render(<AdminStopsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retire stop 108' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Reactivate PATCHes active:true immediately, no dialog', async () => {
    respondWith([retiredStop])
    render(<AdminStopsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate stop 111' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('test-token', '111', { active: true }),
    )
  })

  it('retired rows carry the Retired badge', async () => {
    respondWith([retiredStop])
    render(<AdminStopsPanel />)
    expect(await screen.findByText('Retired')).toBeInTheDocument()
  })

  it('ops scope is read-only: badge, no Retire/Reactivate controls', async () => {
    respondWith([activeStop, retiredStop])
    render(<AdminStopsPanel scope="ops" />)
    expect(await screen.findByText('Retired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retire stop/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reactivate stop/ })).not.toBeInTheDocument()
  })
})
