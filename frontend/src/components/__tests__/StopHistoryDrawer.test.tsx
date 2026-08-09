import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StopHistoryDrawer } from '../StopHistoryDrawer'
import { getStopHistory, type StopHistoryResponse } from '../../api/routeRuns'

const getAccessToken = vi.fn().mockResolvedValue('test-token')
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ getAccessToken }) }))
vi.mock('../../api/routeRuns', () => ({ getStopHistory: vi.fn() }))

const mockHistory = vi.mocked(getStopHistory)

// SEAM-D D5b — read-only stop history drawer.
// Worker identity NEVER appears; absence renders "no observations".

const fixture = (over: Partial<StopHistoryResponse> = {}): StopHistoryResponse => ({
  stop_id: '31150',
  total_visits: 2,
  limit: 20,
  offset: 0,
  entries: [
    {
      visit_date: '2026-07-09',
      started_at: '2026-07-09T10:00:00Z',
      ended_at: '2026-07-09T10:14:00Z',
      outcome: 'completed',
      reason_code: null,
      observations: [
        { type: 'encampment_present', kind: 'presence', norm_status: null, norm_severity: 3, intervention: null, observed_at: '2026-07-09T10:14:00Z' },
        { type: 'picked_up_litter', kind: 'action', norm_status: null, norm_severity: null, intervention: 'picked_up_litter', observed_at: '2026-07-09T10:14:00Z' },
      ],
      effort: { service_minutes: 14, stop_type: 'standard', trash_volume: 2 },
      condition_scores: { cleanliness: 42.1, safety: 10, infra: 0, scored_at: '2026-07-09T11:00:00Z' },
    },
    {
      visit_date: '2026-07-02',
      started_at: '2026-07-02T09:00:00Z',
      ended_at: '2026-07-02T09:05:00Z',
      outcome: 'skipped',
      reason_code: 'safety',
      observations: [],
      effort: null,
      condition_scores: null,
    },
  ],
  ...over,
})

describe('StopHistoryDrawer — D5b', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
  })

  it('renders the visit-grouped chronology from fixtures', async () => {
    mockHistory.mockResolvedValue(fixture())
    render(<StopHistoryDrawer stopId="31150" onClose={() => {}} />)

    expect(await screen.findByText('2 visits on record')).toBeInTheDocument()
    expect(screen.getByText('encampment present')).toBeInTheDocument()
    expect(screen.getByText('picked up litter')).toBeInTheDocument()
    expect(screen.getByText(/Service: 14 min/)).toBeInTheDocument()
    expect(screen.getByText(/cleanliness 42.1/)).toBeInTheDocument()
    // The skipped visit renders as absence + reason, never synthesized rows.
    expect(screen.getByText('skipped')).toBeInTheDocument()
    expect(screen.getByText(/Reason: safety/)).toBeInTheDocument()
    expect(screen.getByText('No observations asserted on this visit.')).toBeInTheDocument()
    expect(mockHistory).toHaveBeenCalledWith('test-token', '31150')
  })

  it('empty history renders "no observations" — absence is a signal, not an error', async () => {
    mockHistory.mockResolvedValue(fixture({ total_visits: 0, entries: [] }))
    render(<StopHistoryDrawer stopId="99999" onClose={() => {}} />)
    expect(await screen.findByText('No observations recorded for this stop.')).toBeInTheDocument()
  })

  it('renders no identity fields even if the API were ever to carry them', async () => {
    // Belt over the server-side guarantee: a response smuggling identity-shaped
    // keys must not surface them — the drawer renders a fixed, identity-free
    // field set, so unknown keys never reach the DOM.
    const poisoned = fixture() as any
    poisoned.entries[0].assigned_user_oid = 'oid-should-never-render-1234'
    poisoned.entries[0].display_name = 'Worker Name Should Never Render'
    poisoned.entries[0].observations[0].captured_by = 'oid-worker-5678'
    mockHistory.mockResolvedValue(poisoned)

    const { container } = render(<StopHistoryDrawer stopId="31150" onClose={() => {}} />)
    await screen.findByText('2 visits on record')

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/oid-should-never-render|oid-worker|Worker Name Should Never Render/)
    expect(text).not.toMatch(/user_id|_oid|reported_by|captured_by|display_name|email/i)
  })

  it('surfaces a load error', async () => {
    mockHistory.mockRejectedValue(new Error('Forbidden'))
    render(<StopHistoryDrawer stopId="31150" onClose={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden')
  })
})
