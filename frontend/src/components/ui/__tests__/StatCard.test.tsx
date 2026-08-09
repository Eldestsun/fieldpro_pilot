import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '../StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Clean Events" value={142} />)
    expect(screen.getByText('Clean Events')).toBeInTheDocument()
    expect(screen.getByText('142')).toBeInTheDocument()
  })

  it('renders the unit inline with the value', () => {
    render(<StatCard label="Observed Minutes" value={318} unit="m" />)
    expect(screen.getByText('318')).toBeInTheDocument()
    expect(screen.getByText('m')).toBeInTheDocument()
  })

  it('applies the tone class to the value', () => {
    render(<StatCard label="Hazards Reported" value={3} tone="danger" />)
    expect(screen.getByText('3').className).toContain('text-(--color-danger)')
  })

  it('defaults to the neutral tone', () => {
    render(<StatCard label="Total Stops" value={24} />)
    expect(screen.getByText('24').className).toContain('text-(--gray-800)')
  })
})
