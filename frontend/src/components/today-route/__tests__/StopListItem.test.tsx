import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StopListItem } from '../StopListItem'
import type { Stop } from '../../../api/routeRuns'

vi.mock('../../../lib/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}))

vi.mock('../../../utils/formatStopLocation', () => ({
  formatStopLocation: (stop: Stop) => stop.on_street_name || 'Test Location',
}))

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
  status: 'pending',
  is_hotspot: false,
  compactor: false,
  has_trash: false,
}

describe('StopListItem', () => {
  it('renders pending status badge for unstarted stop', () => {
    render(<StopListItem stop={{ ...baseStop, status: 'pending' }} onClick={vi.fn()} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders in-progress badge for started stop', () => {
    render(<StopListItem stop={{ ...baseStop, status: 'in_progress' }} onClick={vi.fn()} />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('renders completed badge for done stop', () => {
    render(<StopListItem stop={{ ...baseStop, status: 'done' }} onClick={vi.fn()} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders skipped badge for skipped stop', () => {
    render(<StopListItem stop={{ ...baseStop, status: 'skipped' }} onClick={vi.fn()} />)
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('shows queued indicator when stop has pending offline actions', () => {
    const queuedStop = { ...baseStop, syncState: 'queued' } as Stop & { syncState: string }
    render(<StopListItem stop={queuedStop} onClick={vi.fn()} />)
    expect(screen.getByText(/Queued.*will sync when online/i)).toBeInTheDocument()
  })
})
