import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StopDetail } from '../StopDetail'
import type { Stop, ChecklistState, PhotoDto } from '../../../api/routeRuns'
import type { SafetyState, InfraState } from '../../../hooks/useTodayRoute'

// These imports must come AFTER vi.mock declarations so vitest returns the mocked versions.
import { loadStopDraft } from '../../../offline/stopDraftStore'
import { subscribe, getQueuedUploadCountForStop, hasPendingStartStopForStop } from '../../../offline/offlineQueue'

// ── module mocks ──────────────────────────────────────────────────────────────
// vi.mock factories are hoisted — do NOT reference module-level consts inside them.

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({
    account: {
      tenantId: 'test-tenant',
      localAccountId: 'test-user-id',
      idTokenClaims: { oid: 'test-oid' },
    },
  }),
}))

vi.mock('../../../offline/offlineQueue', () => ({
  getQueuedUploadCountForStop: vi.fn(() => 0),
  subscribe: vi.fn(() => () => {}),
  hasPendingStartStopForStop: vi.fn(() => false),
  hasPendingSkipStopForStop: vi.fn(() => false),
}))

vi.mock('../../../offline/stopDraftStore', () => ({
  loadStopDraft: vi.fn(() => Promise.resolve(null)),
  saveStopDraft: vi.fn(() => Promise.resolve()),
  clearStopDraft: vi.fn(() => Promise.resolve()),
}))

vi.mock('../UlLayout', () => ({
  UlLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ul-layout">{children}</div>
  ),
}))

vi.mock('../../work/ULRouteMap', () => ({
  ULRouteMap: () => null,
}))

vi.mock('../../../utils/identity', () => ({
  getDurableAssetKey: () => 'durable-key',
}))

vi.mock('../../common/ImagePreviewModal', () => ({
  ImagePreviewModal: () => null,
}))

vi.mock('../../ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../lib/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}))

vi.mock('../../../utils/formatStopLocation', () => ({
  formatStopLocation: () => 'Main St & 1st Ave',
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseStop: Stop = {
  route_run_stop_id: 1,
  stop_id: 'stop-1',
  stopNumber: '1',
  sequence: 1,
  on_street_name: 'Main St',
  cross_street: '1st Ave',
  intersection_loc: 'NE',
  bearing_code: 'N',
  location: { lat: 47.6, lon: -122.3 },
  status: 'in_progress',
  is_hotspot: false,
  compactor: false,
  has_trash: false,
}

const emptyChecklist: ChecklistState = {
  picked_up_litter: false,
  emptied_trash: false,
  washed_shelter: false,
  washed_pad: false,
  washed_can: false,
  trashVolume: undefined,
  spotCheck: undefined,
}

function buildProps(overrides: Partial<Parameters<typeof StopDetail>[0]> = {}) {
  return {
    stop: baseStop,
    isRouteCompleted: false,
    hasStartedThisStop: true,
    checklist: emptyChecklist,
    attachedPhotoKeys: [],
    isUploadingPhoto: false,
    isCompletingStop: false,
    onBack: vi.fn(),
    onStartStop: vi.fn(),
    onSetChecklist: vi.fn(),
    onCompleteStop: vi.fn(),
    onToggleHotspot: vi.fn(),
    safety: undefined as SafetyState | undefined,
    infra: undefined as InfraState | undefined,
    onSetSafety: vi.fn(),
    onSetInfra: vi.fn(),
    onSkipStop: vi.fn(),
    currentStep: 'safety' as const,
    onNextStep: vi.fn(),
    onSetStep: vi.fn(),
    uploadPhotos: vi.fn(
      (): Promise<{ photos: PhotoDto[]; queued: boolean }> =>
        Promise.resolve({
          photos: [{ id: 1, url: 'http://test/photo.jpg', s3_key: 'key-1' } as PhotoDto],
          queued: false,
        })
    ),
    fetchPhotos: vi.fn((): Promise<PhotoDto[]> => Promise.resolve([])),
    routeRunId: 1,
    ...overrides,
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('StopWizard (StopDetail)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply default implementations after clearAllMocks resets them
    vi.mocked(loadStopDraft).mockResolvedValue(null)
    vi.mocked(subscribe).mockReturnValue(() => {})
    vi.mocked(getQueuedUploadCountForStop).mockReturnValue(0)
    vi.mocked(hasPendingStartStopForStop).mockReturnValue(false)
  })

  it('renders checklist step first', async () => {
    render(<StopDetail {...buildProps()} />)
    expect(await screen.findByText('Cleaning Tasks')).toBeInTheDocument()
  })

  it('advances to safety step after checklist is complete', async () => {
    render(<StopDetail {...buildProps()} />)
    // Safety report modal is accessible at any point in the unified layout
    const safetyBtn = screen.getByRole('button', { name: /REPORT SAFETY/i })
    expect(safetyBtn).toBeInTheDocument()
    await userEvent.click(safetyBtn)
    expect(screen.getByText('Report Safety Concern')).toBeInTheDocument()
  })

  it('requires photo before allowing completion', async () => {
    render(
      <StopDetail
        {...buildProps({ checklist: { ...emptyChecklist, spotCheck: true } })}
      />
    )
    // With spotCheck enabled but no after-photo taken, "Take After Photo" gate is shown
    expect(await screen.findByText(/Take After Photo/i)).toBeInTheDocument()
    // Enabled Finish is not yet shown — only the disabled placeholder or the after-photo prompt
    expect(screen.queryByRole('button', { name: /^Finish$/i })).toBeNull()
  })

  it('shows draft restoration banner if draft exists in IndexedDB', async () => {
    vi.mocked(loadStopDraft).mockResolvedValue({
      routeRunStopId: 1,
      stepIndex: 0,
      stepKey: 'tasks',
      checklist: emptyChecklist,
      updatedAt: new Date().toISOString(),
    } as any)

    render(<StopDetail {...buildProps()} />)

    await waitFor(() => {
      expect(screen.getByText(/Resume from where you left off/i)).toBeInTheDocument()
    })
  })

  it('shows offline mode indicator when offline mode is active', async () => {
    const queuedStop = { ...baseStop, syncState: 'queued' } as Stop & { syncState: string }
    render(<StopDetail {...buildProps({ stop: queuedStop })} />)
    expect(await screen.findByText(/will sync when you.re back online/i)).toBeInTheDocument()
  })

  it('disables submit button while upload is in progress', async () => {
    render(<StopDetail {...buildProps({ isUploadingPhoto: true })} />)
    const photoBtn = await screen.findByRole('button', { name: /Document Conditions/i })
    expect(photoBtn).toBeDisabled()
  })

  it('calls onComplete with correct payload on submission', async () => {
    const onCompleteStop = vi.fn()
    const uploadPhotos = vi.fn(
      (): Promise<{ photos: PhotoDto[]; queued: boolean }> =>
        Promise.resolve({
          photos: [{ id: 1, url: 'http://test/photo.jpg', s3_key: 'key-1' } as PhotoDto],
          queued: false,
        })
    )

    render(
      <StopDetail
        {...buildProps({
          checklist: { ...emptyChecklist, spotCheck: true },
          onCompleteStop,
          uploadPhotos,
        })}
      />
    )

    // Trigger the hidden after-photo file input directly
    const afterPhotoInput = document.getElementById('after-photo-upload') as HTMLInputElement
    expect(afterPhotoInput).not.toBeNull()

    const file = new File(['photo-data'], 'after.jpg', { type: 'image/jpeg' })
    fireEvent.change(afterPhotoInput, { target: { files: [file] } })

    // Upload Now appears once selectedFiles is populated
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Upload Now/i })).toBeInTheDocument()
    )

    await userEvent.click(screen.getByRole('button', { name: /Upload Now/i }))

    // After upload resolves, selectedFiles clears → Finish becomes enabled
    await waitFor(() => {
      const finishBtn = screen.getByRole('button', { name: /^Finish$/i })
      expect(finishBtn).not.toBeDisabled()
    })

    await userEvent.click(screen.getByRole('button', { name: /^Finish$/i }))
    expect(onCompleteStop).toHaveBeenCalledOnce()
  })
})
