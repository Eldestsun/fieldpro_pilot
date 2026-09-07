import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from '../useFocusTrap'

function TrapDialog({ onClose, children }: { onClose?: () => void; children?: React.ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="test dialog">
      {children}
    </div>
  )
}

function Harness({ open, onClose }: { open: boolean; onClose?: () => void }) {
  return (
    <div>
      <button>Opener</button>
      {open && (
        <TrapDialog onClose={onClose}>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </TrapDialog>
      )}
      <button>Outside</button>
    </div>
  )
}

describe('useFocusTrap — S2-9-pre1', () => {
  it('moves focus into the dialog on open (first focusable)', () => {
    render(<Harness open={true} />)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('Tab from the last element wraps to the first (SC 2.4.3)', async () => {
    render(<Harness open={true} />)
    screen.getByRole('button', { name: 'Last' }).focus()
    await userEvent.keyboard('{Tab}')
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('Shift+Tab from the first element wraps to the last', async () => {
    render(<Harness open={true} />)
    screen.getByRole('button', { name: 'First' }).focus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('Escape invokes onClose (SC 2.1.2 — trap is escapable)', async () => {
    const onClose = vi.fn()
    render(<Harness open={true} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the opener when the dialog closes', () => {
    const { rerender } = render(<Harness open={false} />)
    screen.getByRole('button', { name: 'Opener' }).focus()
    rerender(<Harness open={true} />)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    rerender(<Harness open={false} />)
    expect(screen.getByRole('button', { name: 'Opener' })).toHaveFocus()
  })

  it('focuses the container itself when the dialog has no focusable children', () => {
    function EmptyDialog() {
      const ref = useFocusTrap<HTMLDivElement>(true)
      return <div ref={ref} role="dialog" aria-label="empty" />
    }
    render(<EmptyDialog />)
    expect(screen.getByRole('dialog', { name: 'empty' })).toHaveFocus()
  })
})
