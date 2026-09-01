import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminExportDeletePanel } from '../AdminExportDeletePanel'
import {
  requestExport,
  downloadExport,
  executeDelete,
  ExportDeleteApiError,
  type ExportRequestResponse,
  type ExecuteDeleteResponse,
} from '../../../api/exportDelete'

const getAccessToken = vi.fn().mockResolvedValue('test-token')

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ getAccessToken }),
}))

vi.mock('../../../api/exportDelete', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/exportDelete')>()),
  requestExport: vi.fn(),
  downloadExport: vi.fn(),
  executeDelete: vi.fn(),
}))

const mockRequestExport = vi.mocked(requestExport)
const mockDownloadExport = vi.mocked(downloadExport)
const mockExecuteDelete = vi.mocked(executeDelete)

const CONFIRM_TOKEN = 'a'.repeat(64)

const sampleExport: ExportRequestResponse = {
  confirmation_token: CONFIRM_TOKEN,
  export_path: '/api/admin/export-and-delete/export/7',
  expires_at: '2026-09-08T12:00:00Z',
  instructions: 'Use the confirmation_token …',
}

const sampleDelete: ExecuteDeleteResponse = {
  deleted: true,
  deletion_summary: {
    stop_effort_history: 3,
    evidence: 5,
    observations: 12,
    visits: 4,
    audit_log: 42,
  },
  executed_at: '2026-09-01T10:00:00Z',
}

/** Drive the panel through step 1 (request + download) into step 2. */
async function advanceToReview() {
  mockRequestExport.mockResolvedValue(sampleExport)
  mockDownloadExport.mockResolvedValue()
  render(<AdminExportDeletePanel />)

  await userEvent.click(screen.getByRole('button', { name: 'Request export bundle' }))
  await screen.findByRole('button', { name: 'Download bundle' })
  await userEvent.click(screen.getByRole('button', { name: 'Download bundle' }))
  await waitFor(() => expect(mockDownloadExport).toHaveBeenCalledTimes(1))
  await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
}

/** Drive the panel through steps 1 and 2 into step 3. */
async function advanceToExecute() {
  await advanceToReview()
  await userEvent.click(screen.getByRole('button', { name: 'Proceed to execute' }))
}

describe('AdminExportDeletePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('test-token')
  })

  it('starts at step 1 with only the request button; steps 2 and 3 are collapsed', () => {
    render(<AdminExportDeletePanel />)

    expect(screen.getByRole('button', { name: 'Request export bundle' })).toBeInTheDocument()
    expect(screen.queryByText(/Proceed to execute/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Execute deletion' })).not.toBeInTheDocument()
  })

  it('cannot continue to review until the bundle is downloaded', async () => {
    mockRequestExport.mockResolvedValue(sampleExport)
    mockDownloadExport.mockResolvedValue()
    render(<AdminExportDeletePanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Request export bundle' }))

    const continueBtn = await screen.findByRole('button', { name: 'Continue to review' })
    expect(continueBtn).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Download bundle' }))
    await waitFor(() => expect(continueBtn).toBeEnabled())
  })

  it('review step shows the confirmation token and the audit-log purge warning', async () => {
    await advanceToReview()

    expect(screen.getByDisplayValue(CONFIRM_TOKEN)).toBeInTheDocument()
    expect(screen.getByText(/and the audit log itself/)).toBeInTheDocument()
    expect(screen.getByText(/This action is irreversible/)).toBeInTheDocument()
  })

  it('execute button stays disabled until token paste-match AND checkbox', async () => {
    await advanceToExecute()

    const executeBtn = screen.getByRole('button', { name: 'Execute deletion' })
    expect(executeBtn).toBeDisabled()

    // Checkbox alone is not enough
    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this is irreversible/ }))
    expect(executeBtn).toBeDisabled()

    // Wrong token is not enough
    await userEvent.type(screen.getByLabelText(/Paste the confirmation token/), 'wrong-token')
    expect(executeBtn).toBeDisabled()
    expect(screen.getByText('Token does not match.')).toBeInTheDocument()

    // Matching token + checkbox enables
    await userEvent.clear(screen.getByLabelText(/Paste the confirmation token/))
    await userEvent.click(screen.getByLabelText(/Paste the confirmation token/))
    await userEvent.paste(CONFIRM_TOKEN)
    expect(executeBtn).toBeEnabled()

    // Unchecking disables again
    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this is irreversible/ }))
    expect(executeBtn).toBeDisabled()
  })

  it('never calls executeDelete on stepper transitions alone', async () => {
    await advanceToExecute()

    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this is irreversible/ }))
    await userEvent.click(screen.getByLabelText(/Paste the confirmation token/))
    await userEvent.paste(CONFIRM_TOKEN)

    // Everything armed, but the button was never clicked
    expect(mockExecuteDelete).not.toHaveBeenCalled()
  })

  it('successful execute shows the per-table deletion summary including audit_log', async () => {
    mockExecuteDelete.mockResolvedValue(sampleDelete)
    await advanceToExecute()

    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this is irreversible/ }))
    await userEvent.click(screen.getByLabelText(/Paste the confirmation token/))
    await userEvent.paste(CONFIRM_TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'Execute deletion' }))

    await waitFor(() =>
      expect(mockExecuteDelete).toHaveBeenCalledWith('test-token', CONFIRM_TOKEN),
    )
    expect(
      await screen.findByText(/Deletion complete\. This page is now showing residual UI state/),
    ).toBeInTheDocument()
    expect(screen.getByText('audit_log')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    // Execute controls are gone after success
    expect(screen.queryByRole('button', { name: 'Execute deletion' })).not.toBeInTheDocument()
  })

  it('maps a 410 to the token-expired message', async () => {
    mockExecuteDelete.mockRejectedValue(
      new ExportDeleteApiError('Confirmation token has expired.', 410),
    )
    await advanceToExecute()

    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this is irreversible/ }))
    await userEvent.click(screen.getByLabelText(/Paste the confirmation token/))
    await userEvent.paste(CONFIRM_TOKEN)
    await userEvent.click(screen.getByRole('button', { name: 'Execute deletion' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirmation token expired, request a new export bundle.',
    )
  })

  it('shows an error when the export request fails', async () => {
    mockRequestExport.mockRejectedValue(
      new ExportDeleteApiError('Failed to request export bundle (500)', 500),
    )
    render(<AdminExportDeletePanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Request export bundle' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to request export bundle (500)',
    )
  })
})
