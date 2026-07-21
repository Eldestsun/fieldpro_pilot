import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '../ProgressBar'

function getFill(container: HTMLElement): HTMLElement {
  return container.querySelector('[style*="width"]') as HTMLElement
}

describe('ProgressBar', () => {
  it('computes fill width from value/max', () => {
    const { container } = render(<ProgressBar value={14} max={24} />)
    expect(getFill(container).style.width).toBe(`${(14 / 24) * 100}%`)
  })

  it('clamps to 100% and floors at 0%', () => {
    const { container: over } = render(<ProgressBar value={30} max={24} />)
    expect(getFill(over).style.width).toBe('100%')
    const { container: under } = render(<ProgressBar value={-5} max={24} />)
    expect(getFill(under).style.width).toBe('0%')
  })

  it('renders 0% when max is 0', () => {
    const { container } = render(<ProgressBar value={5} max={0} />)
    expect(getFill(container).style.width).toBe('0%')
  })

  it('shows the "value of max" label when showLabel is set', () => {
    render(<ProgressBar value={14} max={24} showLabel />)
    expect(screen.getByText('14 of 24')).toBeInTheDocument()
    expect(screen.getByText('58%')).toBeInTheDocument()
  })

  it('applies the tone class to the fill', () => {
    const { container } = render(<ProgressBar value={1} max={2} tone="brand" />)
    expect(getFill(container).className).toContain('bg-(--color-brand-700)')
  })
})
