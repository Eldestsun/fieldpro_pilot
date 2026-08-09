import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listAuditLog, downloadAuditLogCsv } from '../auditLog'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('listAuditLog', () => {
  it('sends bearer token and widens the to-date to end of day', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], total: 0, from: 'x', to: 'y' }),
    })

    await listAuditLog('tok', { from: '2026-06-01', to: '2026-07-01', action: 'auth.login' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/admin/audit-log?')
    expect(url).toContain('from=2026-06-01')
    expect(url).toContain(`to=${encodeURIComponent('2026-07-01T23:59:59.999Z')}`)
    expect(url).toContain('action=auth.login')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throws the backend JSON error message on non-ok responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Date range exceeds 365 days. Narrow the window to page through the log." }),
    })

    await expect(listAuditLog('tok')).rejects.toThrow(/365 days/)
  })
})

describe('downloadAuditLogCsv', () => {
  it('fetches format=csv and triggers a blob download', async () => {
    const csvBlob = new Blob(['id,action\n1,auth.login'], { type: 'text/csv' })
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(csvBlob),
    })

    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:csv-url')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    await downloadAuditLogCsv('tok', { from: '2026-06-01', to: '2026-07-01' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('format=csv')
    expect(init.headers.Authorization).toBe('Bearer tok')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    expect(blobArg.type).toBe('text/csv')

    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-url')
  })

  it('throws on non-ok CSV responses without downloading', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    await expect(downloadAuditLogCsv('tok')).rejects.toThrow('Forbidden')
    expect(click).not.toHaveBeenCalled()
  })
})
