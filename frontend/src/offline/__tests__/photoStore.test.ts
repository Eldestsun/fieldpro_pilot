import { describe, it, expect } from 'vitest'
import { putPhoto } from '../photoStore'

// ISSUE-063 — the store must own real bytes. An empty/unreadable source blob
// is rejected AT CAPTURE (visible to the user immediately) instead of being
// persisted and replayed as an empty multipart that 400s forever.
describe('photoStore — ISSUE-063 byte materialization', () => {
  it('rejects an empty blob at put time with a user-actionable error', async () => {
    await expect(
      putPhoto({
        tenantId: 't1',
        oid: 'o1',
        routeRunStopId: 1,
        kind: 'completion',
        filename: 'empty.png',
        contentType: 'image/png',
        blob: new Blob([]),
      }),
    ).rejects.toThrow(/empty or unreadable/)
  })
})
