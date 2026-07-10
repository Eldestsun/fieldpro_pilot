import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteCreatePanel } from '../RouteCreatePanel'
import { useCreateRoute } from '../../hooks/useCreateRoute'
import {
  fetchPools,
  fetchUlUsers,
  previewRouteRun,
  createRouteRun,
  getStopsScoped,
} from '../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../api/routeRuns', () => ({
  fetchPools: vi.fn(),
  fetchUlUsers: vi.fn(),
  previewRouteRun: vi.fn(),
  createRouteRun: vi.fn(),
  getStopsScoped: vi.fn(),
}))

const mockPools = vi.mocked(fetchPools)
const mockUls = vi.mocked(fetchUlUsers)
const mockPreview = vi.mocked(previewRouteRun)
const mockCreate = vi.mocked(createRouteRun)
const mockStops = vi.mocked(getStopsScoped)

// SEAM-D D3b — the picker drives the REAL useCreateRoute hook; only the API
// layer is mocked, so these tests assert the exact request bodies.
function Host() {
  const hook = useCreateRoute()
  useEffect(() => {
    hook.open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <RouteCreatePanel isOpen={hook.isOpen} onClose={hook.close} hook={hook} />
}

const previewFixture = {
  ordered_stops: [
    { stop_id: '100', sequence: 0, location: 'Main St' },
    { stop_id: '200', sequence: 1, location: 'Second Ave' },
  ],
  distance_m: 3218.68,
  duration_s: 600,
  truncated: false,
  used_stops: 2,
} as any

describe('RouteCreatePanel — D3b ad-hoc stop picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
    mockPools.mockResolvedValue([{ id: 'TEST_POOL', name: 'Test Pool' } as any])
    mockUls.mockResolvedValue([{ id: 'oid-worker-1', displayName: 'Worker One' } as any])
    mockStops.mockResolvedValue({
      items: [
        { stop_id: '100', on_street_name: 'Main St' },
        { stop_id: '200', on_street_name: 'Second Ave' },
      ],
      total: 2,
    } as any)
    mockPreview.mockResolvedValue(previewFixture)
    mockCreate.mockResolvedValue()
  })

  async function fillSharedFields() {
    render(<Host />)
    await screen.findByText('Create Route')
    // Pool and crew selects, in DOM order (pool first, crew second).
    const combos = await screen.findAllByRole('combobox')
    await userEvent.selectOptions(combos[0], 'TEST_POOL')
    await userEvent.selectOptions(combos[1], 'oid-worker-1')
  }

  it('picker flow: search → select stops → preview → create posts stop_ids + is_adhoc: true', async () => {
    await fillSharedFields()

    await userEvent.click(screen.getByRole('tab', { name: 'Ad-hoc Stops' }))

    await userEvent.type(screen.getByPlaceholderText('Search stop number or street…'), 'main')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(mockStops).toHaveBeenCalledWith('test-token', { page: 1, pageSize: 20, q: 'main' }, 'ops'),
    )

    await userEvent.click(await screen.findByRole('button', { name: '+ 100 — Main St' }))
    await userEvent.click(screen.getByRole('button', { name: '+ 200 — Second Ave' }))

    await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() =>
      expect(mockPreview).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ poolId: 'TEST_POOL', ulId: 'oid-worker-1', stopIds: ['100', '200'] }),
      ),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Save Route' }))
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          poolId: 'TEST_POOL',
          ulId: 'oid-worker-1',
          stopIds: ['100', '200'],
          isAdhoc: true,
        }),
      ),
    )
  })

  it('ad-hoc preview is blocked until at least 2 stops are picked', async () => {
    await fillSharedFields()
    await userEvent.click(screen.getByRole('tab', { name: 'Ad-hoc Stops' }))

    const previewBtn = screen.getByRole('button', { name: 'Generate Preview' })
    expect(previewBtn).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Search stop number or street…'), 'main')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: '+ 100 — Main St' }))
    expect(previewBtn).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '+ 200 — Second Ave' }))
    expect(previewBtn).toBeEnabled()

    // Removing a picked stop drops back below the floor.
    await userEvent.click(screen.getByRole('button', { name: 'Remove stop 100' }))
    expect(previewBtn).toBeDisabled()
  })

  it('pool mode is untouched: create body carries NO stop_ids and NO is_adhoc', async () => {
    await fillSharedFields()

    await userEvent.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await screen.findByRole('button', { name: 'Save Route' })
    await userEvent.click(screen.getByRole('button', { name: 'Save Route' }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    const body = mockCreate.mock.calls[0][1] as Record<string, unknown>
    expect(body.poolId).toBe('TEST_POOL')
    expect('stopIds' in body).toBe(false)
    expect('isAdhoc' in body).toBe(false)
  })
})
