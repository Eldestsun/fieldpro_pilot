import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OfflineStatusBar } from '../OfflineStatusBar'

// Imported so vi.mocked() can type it
import { useOfflineSync } from '../../../offline/OfflineSyncContext'
import type { OfflineSyncState } from '../../../offline/OfflineSyncContext'

vi.mock('../../../offline/OfflineSyncContext', () => ({
  useOfflineSync: vi.fn(),
}))

// PING-RETRY: overridable auth mock so tests can flip isReconnecting.
const authState = vi.hoisted(() => ({
  current: { account: null as unknown, isReconnecting: false },
}))
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => authState.current,
}))

vi.mock('../../../offline/offlineQueue', () => ({
  dismissConflict: vi.fn(),
}))

vi.mock('../ConflictResolutionModal', () => ({
  ConflictResolutionModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="conflict-modal" onClick={onClose}>Conflict Modal</div>
  ),
}))

const idle: OfflineSyncState = {
  pendingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  syncStatus: 'idle',
  conflictActions: [],
  isOfflineMode: false,
}

function setup(state: Partial<OfflineSyncState> = {}) {
  vi.mocked(useOfflineSync).mockReturnValue({ ...idle, ...state })
  return render(<OfflineStatusBar />)
}

describe('OfflineStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.current = { account: null, isReconnecting: false }
  })

  it('is hidden when queue is empty and device is online', () => {
    const { container } = setup()
    expect(container.firstChild).toBeNull()
  })

  it('shows pending count when actions are queued', () => {
    setup({ syncStatus: 'syncing', pendingCount: 3 })
    expect(screen.getByText(/Syncing 3 action/i)).toBeInTheDocument()
  })

  it('shows syncing indicator during replay', () => {
    setup({ syncStatus: 'syncing', pendingCount: 1 })
    expect(screen.getByText(/Syncing 1 action/i)).toBeInTheDocument()
  })

  it('shows success message after clean replay', () => {
    setup({ syncStatus: 'success' })
    expect(screen.getByText(/All synced/i)).toBeInTheDocument()
  })

  it('shows conflict count and opens modal on tap', async () => {
    setup({ conflictCount: 2, conflictActions: [] })
    expect(screen.getByText(/2 stop.*need attention/i)).toBeInTheDocument()

    await userEvent.click(screen.getByText(/2 stop.*need attention/i))
    expect(screen.getByTestId('conflict-modal')).toBeInTheDocument()
  })

  it('shows offline mode banner when manual offline mode is active', () => {
    setup({ isOfflineMode: true, pendingCount: 5 })
    expect(screen.getByText(/Offline.*5 action/i)).toBeInTheDocument()
  })

  it('shows reconnecting banner while the session ping is backing off (PING-RETRY)', () => {
    authState.current = { account: null, isReconnecting: true }
    setup()
    expect(screen.getByText(/Reconnecting to server/i)).toBeInTheDocument()
  })

  it('device-offline banner outranks reconnecting (PING-RETRY priority)', () => {
    authState.current = { account: null, isReconnecting: true }
    setup({ isOfflineMode: true, pendingCount: 1 })
    expect(screen.getByText(/Offline.*1 action/i)).toBeInTheDocument()
    expect(screen.queryByText(/Reconnecting to server/i)).not.toBeInTheDocument()
  })
})
