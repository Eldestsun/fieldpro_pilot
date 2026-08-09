import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminAuditLogPanel } from '../AdminAuditLogPanel'
import { listAuditLog, downloadAuditLogCsv, type AuditLogEntry } from '../../../api/auditLog'

const getAccessToken = vi.fn().mockResolvedValue('test-token')

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ getAccessToken }),
}))

vi.mock('../../../api/auditLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/auditLog')>()),
  listAuditLog: vi.fn(),
  downloadAuditLogCsv: vi.fn(),
}))

const mockListAuditLog = vi.mocked(listAuditLog)
const mockDownloadCsv = vi.mocked(downloadAuditLogCsv)

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
const expectedFrom = isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
const expectedTo = isoDate(new Date())

const sampleEntries: AuditLogEntry[] = [
  {
    id: 1,
    actor_oid: 'aaaa-1111-bbbb-2222',
    action: 'admin.audit_log_read',
    resource_type: 'audit_log',
    resource_id: null,
    detail: null,
    ip_address: '10.0.0.1',
    occurred_at: '2026-07-01T12:00:00Z',
  },
  {
    id: 2,
    actor_oid: 'cccc-3333-dddd-4444',
    action: 'auth.login',
    resource_type: null,
    resource_id: null,
    detail: null,
    ip_address: '10.0.0.2',
    occurred_at: '2026-07-02T08:30:00Z',
  },
]

function respondWith(entries: AuditLogEntry[], total = entries.length) {
  mockListAuditLog.mockResolvedValue({
    entries,
    total,
    from: `${expectedFrom}T00:00:00.000Z`,
    to: `${expectedTo}T23:59:59.999Z`,
  })
}

describe('AdminAuditLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
  })

  it('fetches with default last-30-days window on mount', async () => {
    respondWith(sampleEntries)
    render(<AdminAuditLogPanel />)

    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(1))
    expect(mockListAuditLog).toHaveBeenCalledWith('test-token', {
      from: expectedFrom,
      to: expectedTo,
      action: undefined,
    })
  })

  it('renders entries with raw actor_oid (no name resolution)', async () => {
    respondWith(sampleEntries)
    render(<AdminAuditLogPanel />)

    // Assert on actor_oid / ip cells — action strings also appear as dropdown
    // options, so they are ambiguous text queries.
    expect(await screen.findByText('aaaa-1111-bbbb-2222')).toBeInTheDocument()
    expect(screen.getByText('cccc-3333-dddd-4444')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
  })

  it('refetches with the action param when the action filter changes', async () => {
    respondWith(sampleEntries)
    render(<AdminAuditLogPanel />)
    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(1))

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'auth.login')

    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(2))
    expect(mockListAuditLog).toHaveBeenLastCalledWith('test-token', {
      from: expectedFrom,
      to: expectedTo,
      action: 'auth.login',
    })
  })

  it('refetches when the from-date changes', async () => {
    respondWith(sampleEntries)
    render(<AdminAuditLogPanel />)
    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(1))

    const fromInput = screen.getByLabelText('From')
    // fireEvent-style direct change: type="date" inputs don't accept keystroke typing
    await userEvent.clear(fromInput)
    await userEvent.type(fromInput, '2026-06-01')

    await waitFor(() =>
      expect(mockListAuditLog).toHaveBeenLastCalledWith('test-token', {
        from: '2026-06-01',
        to: expectedTo,
        action: undefined,
      }),
    )
  })

  it('Export CSV calls downloadAuditLogCsv with the current filters', async () => {
    respondWith(sampleEntries)
    mockDownloadCsv.mockResolvedValue()
    render(<AdminAuditLogPanel />)
    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(1))

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'auth.login')
    await waitFor(() => expect(mockListAuditLog).toHaveBeenCalledTimes(2))

    await userEvent.click(screen.getByRole('button', { name: /Export CSV/i }))

    await waitFor(() =>
      expect(mockDownloadCsv).toHaveBeenCalledWith('test-token', {
        from: expectedFrom,
        to: expectedTo,
        action: 'auth.login',
      }),
    )
  })

  it('shows the empty state when there are no entries', async () => {
    respondWith([])
    render(<AdminAuditLogPanel />)

    expect(
      await screen.findByText('No audit entries in this window.'),
    ).toBeInTheDocument()
  })

  it('shows an error state with retry when the fetch fails', async () => {
    mockListAuditLog.mockRejectedValueOnce(new Error('boom (500)'))
    respondWith(sampleEntries)
    render(<AdminAuditLogPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom (500)')

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    // actor_oid is unique to table cells (action strings also exist as dropdown options)
    expect(await screen.findByText('cccc-3333-dddd-4444')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a truncation notice when total exceeds the returned rows', async () => {
    respondWith(sampleEntries, 4321)
    render(<AdminAuditLogPanel />)

    expect(
      await screen.findByText(/Showing the most recent 2 of 4321 entries/i),
    ).toBeInTheDocument()
  })
})
